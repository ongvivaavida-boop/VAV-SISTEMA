'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Papa from 'papaparse'

// --- POLYFILLS FOR PDF.JS ---
if (typeof Promise.withResolvers === 'undefined') {
    // @ts-ignore
    Promise.withResolvers = function () {
        let resolve, reject;
        const promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    };
}

if (typeof global.self === 'undefined') {
    // @ts-ignore
    global.self = global;
}

if (typeof global.DOMMatrix === 'undefined') {
    // @ts-ignore
    global.DOMMatrix = class DOMMatrix {
        constructor() {
            // @ts-ignore
            this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
            // @ts-ignore
            this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
            // @ts-ignore
            this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
            // @ts-ignore
            this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
            // @ts-ignore
            this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
        }
    }
}

export interface ParsedTransaction {
    date: string
    description: string
    amount: number
    type: 'entrada' | 'saida'
    originalLine?: string
    isInitialBalance?: boolean
}

export async function parseFile(formData: FormData): Promise<{ success: boolean, data?: ParsedTransaction[], error?: string }> {
    try {
        const file = formData.get('file') as File
        const bankId = formData.get('bankId') as string // User selected bank ID (we might override or validate)

        if (!file) {
            return { success: false, error: 'Arquivo não fornecido.' }
        }

        const buffer = Buffer.from(await file.arrayBuffer())
        const fileType = file.name.split('.').pop()?.toLowerCase()

        let transactions: ParsedTransaction[] = []

        if (fileType === 'pdf') {
            transactions = await parsePDF(buffer)
        } else if (fileType === 'csv') {
            const text = buffer.toString('utf-8')
            transactions = parseCSV(text)
        } else if (fileType === 'ofx') {
            const text = buffer.toString('utf-8')
            transactions = await parseOFX(text)
        } else {
            return { success: false, error: 'Formato de arquivo não suportado. Use PDF, CSV ou OFX.' }
        }

        return { success: true, data: transactions }

    } catch (error) {
        console.error('Import Error:', error)
        return { success: false, error: 'Erro ao processar arquivo: ' + (error as Error).message }
    }
}

export async function saveImportedTransactions(bankId: string, transactions: ParsedTransaction[]) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'Usuário não autenticado.' }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const allowedRoles = ['Coordenadora ADM', 'Presidência', 'Direção', 'Estagiário(a) de ADM']
    if (!profile || !allowedRoles.includes(profile.role)) {
        return { success: false, error: 'Permissão negada.' }
    }

    try {
        const entries = transactions.map(t => ({
            bank_id: bankId,
            type: t.type,
            description: t.description,
            category: t.isInitialBalance ? 'Saldo Inicial' : 'Outros', // Identify Initial Balance
            amount: t.amount,
            entry_date: t.date,
            responsible_id: user.id,
            created_by: user.id
        }))

        const { error } = await supabase
            .from('financial_entries')
            .insert(entries)

        if (error) throw error

        revalidatePath('/dashboard/admin')
        return { success: true }
    } catch (error) {
        console.error('Save Error:', error)
        return { success: false, error: 'Erro ao salvar transações: ' + (error as Error).message }
    }
}

// --- MAIN PDF PARSER CONTROLLER ---

async function parsePDF(buffer: Buffer): Promise<ParsedTransaction[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfLib = require('pdf-parse')
    const pdf = pdfLib.default || pdfLib

    if (typeof pdf !== 'function') throw new Error(`Erro interno: PDF lib inválida.`)

    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout leitura PDF (15s)')), 15000)
    )

    const parseTask = pdf(buffer).then((data: any) => data.text)
    const text = await Promise.race([parseTask, timeout]) as string

    const lines = text.split('\n')
    const upperText = text.toUpperCase()

    // 1. DETECT BANK
    // Spec Rule 3: Detecção Automática
    if (
        (upperText.includes('EXTRATO DE CONTA CORRENTE') && (upperText.includes('LOTE') || upperText.includes('HISTÓRICO'))) ||
        upperText.includes('BANCO DO BRASIL')
    ) {
        return parseBB(lines)
    }
    else if (
        upperText.includes('EXTRATO MENSAL / POR PERÍODO') ||
        upperText.includes('TOTAL DISPONÍVEL (R$)') ||
        upperText.includes('BRADESCO')
    ) {
        return parseBradesco(lines)
    }
    else {
        return parseGeneric(lines)
    }
}

// --- STRICT PARSERS (SPEC V2) ---

function parseBB(lines: string[]): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = []

    // State buffer for the transaction currently being built
    let currentTx: Partial<ParsedTransaction> | null = null

    // Helper to normalize number
    const parseNumber = (str: string) => parseFloat(str.replace(/\./g, '').replace(',', '.'))

    // Regex for Value Line (Block Header)
    // Matches: "20.824,36 (+)" or "1.000,00 (-)"
    // Relaxed: No ^ anchor, looks for pattern anywhere in line
    const valueHeaderRegex = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(\(\+\)|\(\-\))/

    // Regex for Date Line (Second line of block)
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/

    const pushCurrentTx = () => {
        if (!currentTx) return

        const desc = (currentTx.description || '').trim()
        const lowerDesc = desc.toLowerCase()

        // 1. FILTER GARBAGE
        if (
            !currentTx.date || // Must have date
            lowerDesc.includes('saldo do dia') ||
            lowerDesc.includes('s a l d o') ||
            lowerDesc.includes('total aplicações') ||
            lowerDesc.includes('juros *') || // "Juros *" often appears in footer
            lowerDesc.includes('iof *') ||
            lowerDesc === 'saldo'
        ) {
            currentTx = null
            return
        }

        // 2. DETECT SALDO ANTERIOR
        if (lowerDesc.includes('saldo anterior')) {
            currentTx.isInitialBalance = true
            currentTx.description = 'Saldo Anterior (Importado)'
        } else {
            // 3. CLEAN DESCRIPTION
            let cleanDesc = desc

            // Remove Lote/Doc numbers that often appear at start of description line
            // Example: "13105121001 Pix - Enviado"
            // Remove leading digits if they are len > 4
            cleanDesc = cleanDesc.replace(/^\d{4,}\s*/, '')

            // Also remove "DiaLoteDocumento" or similar headers if they got mixed in
            cleanDesc = cleanDesc.replace(/DiaLoteDocumento/g, '')

            currentTx.description = cleanDesc.replace(/\s+/g, ' ').trim()
        }

        transactions.push(currentTx as ParsedTransaction)
        currentTx = null
    }

    // Iterate
    for (const line of lines) {
        const cleanLine = line.trim()
        if (cleanLine.length < 2) continue

        // CHECK 1: IS IT A VALUE HEADER?
        const valMatch = cleanLine.match(valueHeaderRegex)
        if (valMatch) {
            // Push previous block
            pushCurrentTx()

            // Start new block
            const amount = parseNumber(valMatch[1])
            const isNegative = valMatch[2] === '(-)'

            currentTx = {
                amount: amount,
                type: isNegative ? 'saida' : 'entrada',
                description: '',
                date: '' // Expecting date next
            }
            continue
        }

        // CHECK 2: IS IT A DATE LINE? (Inside a block)
        if (currentTx && !currentTx.date) {
            const dateMatch = cleanLine.match(dateRegex)
            if (dateMatch) {
                const dateStr = dateMatch[1]

                // IGNORE "00/00/0000" (Saldo do dia)
                if (dateStr === '00/00/0000') {
                    // Do nothing
                } else {
                    const [d, m, y] = dateStr.split('/')
                    currentTx.date = `${y}-${m}-${d}`
                }

                // Any extra text after date?
                const leftover = cleanLine.replace(dateMatch[0], '').trim()
                if (leftover) currentTx.description += leftover + ' '

                continue
            }
        }

        // CHECK 3: IT IS DESCRIPTION (Inside a block)
        if (currentTx) {
            currentTx.description += cleanLine + ' '
        }
    }

    // Flush last
    pushCurrentTx()

    return transactions
}

function parseBradesco(lines: string[]): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = []
    let currentDate: string | null = null
    let prefixDescription = ''
    let waitingForSaldoValue = false

    // Helper to normalize Bradesco numbers: "1.000,00" -> 1000.00
    const parseBrNumber = (str: string) => parseFloat(str.replace(/\./g, '').replace(',', '.'))

    for (const line of lines) {
        let cleanLine = line.trim()
        if (cleanLine.length < 3) continue

        // --- FIX STICKY COLUMNS (Bradesco Bug) ---
        // Solves "29885183,63" -> "2988518 3,63"
        // Looks for 7 digits followed immediately by a value pattern
        cleanLine = cleanLine.replace(/(\d{7})(\d+,\d{2})/, '$1 $2')

        // --- 1. IGNORE GARBAGE & HEADERS ---
        if (
            /^Extrato de/i.test(cleanLine) ||
            /^Agência/i.test(cleanLine) ||
            /Total Disponível/i.test(cleanLine) ||
            /Saldos Invest/i.test(cleanLine) ||
            /data\s+lançamento/i.test(cleanLine) ||
            cleanLine.includes('Ouvidoria') ||
            cleanLine.includes('Alô Bradesco')
            // RENTAB filter removed as they are valid Credits/Revenue
        ) {
            continue
        }

        // --- 2. IGNORE FOOTER TOTALS ---
        // User explicitly said: "o total que sobra vc vai IGNORAR"
        // Relaxed check: Case insensitive start
        if (cleanLine.toLowerCase().startsWith('total')) {
            continue
        }

        // --- 3. STATE MACHINE: DATE HANDLING ---
        // Does this line start with a date?
        const dateMatch = cleanLine.match(/^(\d{2}\/\d{2}\/\d{4})/)
        if (dateMatch) {
            const [d, m, y] = dateMatch[1].split('/')
            currentDate = `${y}-${m}-${d}`
        }

        // If we don't have a date yet and this isn't a Saldo Anterior, likely garbage or header before first date
        // But wait, Saldo Anterior has a date.

        // --- 4. SALDO ANTERIOR (BASE) ---
        // Case A: Multi-line detection
        if (waitingForSaldoValue) {
            const values = [...cleanLine.matchAll(/(-)?(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
            if (values.length > 0) {
                const lastValue = values[values.length - 1]
                const amount = parseBrNumber(lastValue[2])
                const isNegative = lastValue[1] === '-'

                let finalDate = currentDate || new Date().toISOString().split('T')[0]
                if (currentDate && currentDate.endsWith('-12-31')) {
                    const [y, m, d] = currentDate.split('-').map(Number)
                    const nextDay = new Date(y + 1, 0, 1) // Jan 1st next year
                    finalDate = nextDay.toISOString().split('T')[0]
                }

                transactions.push({
                    date: finalDate,
                    description: 'Saldo Anterior (Importado)',
                    amount: Math.abs(amount),
                    type: isNegative ? 'saida' : 'entrada',
                    isInitialBalance: true,
                    originalLine: 'SALDO ANTERIOR ' + cleanLine
                })
                waitingForSaldoValue = false
                continue
            }
        }

        if (cleanLine.toUpperCase().includes('SALDO ANTERIOR')) {
            // Usually: "31/12/2025 SALDO ANTERIOR ... 34.275,68"
            // We need to extract the LAST number as the Balance.
            const values = [...cleanLine.matchAll(/(-)?(\d{1,3}(?:\.\d{3})*,\d{2})/g)]
            if (values.length > 0) {
                // Value on same line
                const lastValue = values[values.length - 1]
                const amount = parseBrNumber(lastValue[2])
                const isNegative = lastValue[1] === '-'

                let finalDate = currentDate || new Date().toISOString().split('T')[0]
                if (currentDate && currentDate.endsWith('-12-31')) {
                    const [y, m, d] = currentDate.split('-').map(Number)
                    finalDate = new Date(y + 1, 0, 1).toISOString().split('T')[0]
                }

                transactions.push({
                    date: finalDate,
                    description: 'Saldo Anterior (Importado)',
                    amount: Math.abs(amount),
                    type: isNegative ? 'saida' : 'entrada',
                    isInitialBalance: true,
                    originalLine: cleanLine
                })
            } else {
                // Value might be on next line
                waitingForSaldoValue = true
            }
            continue
        }

        // --- 5. TRANSACTIONS ---
        // We look for lines that end with numbers.
        // Bradesco Layout: [Date?] [Desc] [Doc] [Value] [Balance]
        // "Value" is the transaction amount. "Balance" is the running balance.
        // There should be at least 2 numbers found if parsing text linearly: The transaction amount and the new balance.
        // Exception: Sometimes "Value" is blank (e.g. just a text line), but those shouldn't be transactions.

        if (!currentDate) {
            // If we found a transaction-looking line BEFORE the first date, ignore it (Safety)
            continue
        }

        const valueMatches = [...cleanLine.matchAll(/(-)?(\d{1,3}(?:\.\d{3})*,\d{2})/g)]

        if (valueMatches.length === 0) {
            // Text only line. Append to prefix?
            // "DES: MANOEL MESSIAS..."
            if (!/data\s/i.test(cleanLine)) {
                prefixDescription += ' ' + cleanLine
            }
            continue
        }

        // We have numbers.
        // Logic: The LAST number is the Balance (ignore).
        // The PENULTIMATE number is the Transaction Value.
        // Unless... there is only 1 number?

        let transactionAmount = 0
        let isDebit = false
        let isValidTransaction = false

        if (valueMatches.length >= 2) {
            // Robust case: distinct transaction and balance
            const transMatch = valueMatches[valueMatches.length - 2] // Penultimate
            transactionAmount = parseBrNumber(transMatch[2])
            isDebit = transMatch[1] === '-'
            isValidTransaction = true
        } else if (valueMatches.length === 1) {
            // One number case.
            // If it is RENTAB (Credit), it might have 2 numbers?
            // "RENTAB... 3,63 ... 34.279,31". Yes, 2 numbers.
            // Logic holds.
            // If only 1 number is found, it's safer to assume it's a "broken" line where we only caught the Balance or only the Value.
            // However, looking at the image provided: "RENTA.INVEST... 0,02 ... 29.898,59" -> 2 numbers.
            // "TARIFA BANCARIA ... -1,75 ... 31.066,14" -> 2 numbers.
            // It seems consistent that valid transactions have 2 numbers in the layout.
            // Single number lines are likely "Total" lines (filtered) or just noise.
            // SKIP single number lines to be safe.
            continue
        }

        if (isValidTransaction) {
            // CLEAN DESCRIPTION
            let description = cleanLine

            // Remove Date
            if (dateMatch) description = description.replace(dateMatch[0], '')

            // Remove Values (All of them)
            valueMatches.forEach(m => description = description.replace(m[0], ''))

            // Remove Doc Numbers (Standalone digits, usually 5-9 digits)
            // Be careful not to kill "166" in "Internet VAV 166" if it's part of desc.
            // But usually Doc is separate column.
            // Regex for standalone digits > 3?
            description = description.replace(/\b\d{4,20}\b/g, '') // Remove long numbers (Doc IDs)

            // Add Prefix
            if (prefixDescription) {
                // Check if prefix belongs to this line
                description = prefixDescription + ' ' + description
                prefixDescription = ''
            }

            // Cleanup whitespace/dashes
            description = description.trim().replace(/^-/, '').replace(/-$/, '').trim()

            // Clean up RENTAB description if needed
            if (description.includes('RENTAB.INVEST')) {
                description = 'Rendimento Investimento ' + description.replace('RENTAB.INVEST', '').replace('FACILCRED', '').replace('*', '').trim()
            }

            if (description.length > 2) {
                transactions.push({
                    date: currentDate, // Use inherited date
                    description: description.trim(),
                    amount: Math.abs(transactionAmount),
                    type: isDebit ? 'saida' : 'entrada',
                    originalLine: cleanLine
                })
            }
        }
    }

    return transactions
}

function parseGeneric(lines: string[]): ParsedTransaction[] {
    // Fallback for CSV/Other
    // Same as before
    const transactions: ParsedTransaction[] = []
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/
    const amountRegex = /(-?R?\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})([D|C]|-)?/

    for (const line of lines) {
        if (line.length < 10) continue
        const matchDate = line.match(dateRegex)
        const matchAlloc = line.match(amountRegex)

        if (matchDate && matchAlloc) {
            const [d, m, y] = matchDate[1].split('/')
            const amount = parseFloat(matchAlloc[2].replace(/\./g, '').replace(',', '.'))
            const isNeg = matchAlloc[1]?.includes('-') || matchAlloc[3]?.includes('-') || matchAlloc[3] === 'D'

            transactions.push({
                date: `${y}-${m}-${d}`,
                description: line.replace(matchDate[0], '').replace(matchAlloc[0], '').trim(),
                amount: Math.abs(amount),
                type: isNeg ? 'saida' : 'entrada',
                originalLine: line
            })
        }
    }
    return transactions
}


function parseCSV(text: string): ParsedTransaction[] {
    const results = Papa.parse(text, { header: true, skipEmptyLines: true })
    const transactions: ParsedTransaction[] = []

    for (const row of results.data as any[]) {
        const keys = Object.keys(row).reduce((acc, k) => {
            acc[k.toLowerCase()] = k;
            return acc
        }, {} as Record<string, string>)

        const dateKey = keys['data'] || keys['date'] || keys['dt']
        const descKey = keys['descrição'] || keys['descricao'] || keys['historico'] || keys['memo']
        const amountKey = keys['valor'] || keys['amount'] || keys['value'] || keys['vl'] || keys['valor (r$)']

        if (dateKey && amountKey) {
            const dateStr = row[dateKey]
            let isoDate = dateStr
            // Handle different date formats if needed
            if (dateStr && dateStr.includes('/')) {
                const parts = dateStr.split('/')
                if (parts[2]?.length === 4) isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`
            }

            const amountStr = String(row[amountKey]).replace('R$', '').trim()
            let amount = 0

            if (amountStr.includes(',') && !amountStr.includes('.')) {
                amount = parseFloat(amountStr.replace(',', '.'))
            } else if (amountStr.includes('.') && amountStr.includes(',')) {
                amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'))
            } else {
                amount = parseFloat(amountStr)
            }

            if (isNaN(amount)) continue

            transactions.push({
                date: isoDate,
                description: row[descKey] || 'Importação CSV',
                amount: Math.abs(amount),
                type: amount < 0 ? 'saida' : 'entrada'
            })
        }
    }
    return transactions
}

async function parseOFX(text: string): Promise<ParsedTransaction[]> {
    const transactions: ParsedTransaction[] = []
    const transactionRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g
    let match;

    while ((match = transactionRegex.exec(text)) !== null) {
        const block = match[1]
        const dateMatch = block.match(/<DTPOSTED>(.*)/)
        const amountMatch = block.match(/<TRNAMT>(.*)/)
        const memoMatch = block.match(/<MEMO>(.*)/)

        if (dateMatch && amountMatch) {
            const rawDate = dateMatch[1].trim()
            const isoDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`
            const amount = parseFloat(amountMatch[1].replace(',', '.'))
            const description = memoMatch ? memoMatch[1].trim() : 'Transação OFX'

            transactions.push({
                date: isoDate,
                description,
                amount: Math.abs(amount),
                type: amount < 0 ? 'saida' : 'entrada'
            })
        }
    }
    return transactions
}
