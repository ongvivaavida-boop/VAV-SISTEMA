'use server';

import { createClient } from '@/lib/supabase/server';
import { getCalendarClient } from '@/lib/google';
import { CreateMeetingPayload } from '@/types/meeting';
import { revalidatePath } from 'next/cache';
import { canCreate } from '@/lib/permissions';

export async function createMeetingAction(payload: CreateMeetingPayload) {
    try {
        const supabase = await createClient();

        // 1. Validar usuário autenticado
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error('Usuário não autenticado.');
        }

        // 1.1 Validar permissão de criar reunião
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || !canCreate(profile.role, 'reunioes')) {
            throw new Error('Você não tem permissão para criar reuniões.');
        }

        // 2. Extrair dados
        const { title, description, date, start_time, end_time } = payload;

        // 3. Formatar as datas no padrão ISO 8601 (Ex: 2026-05-20T10:00:00-03:00)
        const startDateTime = `${date}T${start_time}:00-03:00`; // Ajuste o fuso conforme necessário (-03:00 para BRT)
        let endDateTime = `${date}T${end_time}:00-03:00`;

        // Se o horário de término for string-wise "menor" que o de início (ex: Início 22:00, Fim 03:00),
        // concluímos que a reunião atravessou a meia-noite e termina no dia seguinte.
        if (end_time < start_time) {
            const parsedDate = new Date(date + 'T00:00:00'); // Evita fuso UTC mudar o dia
            parsedDate.setDate(parsedDate.getDate() + 1);
            const nextDayString = parsedDate.toISOString().split('T')[0];
            endDateTime = `${nextDayString}T${end_time}:00-03:00`;
        }

        // 4. Injetar a Reunião no Google Calendar
        let hangoutLink = null;
        let googleEventId = null;

        // Obter o ID do calendário das variáveis de ambiente
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (calendarId) {
            console.log('Gerando evento no Google Calendar...');
            const calendar = getCalendarClient();

            const event = {
                summary: title,
                description: description || '',
                start: {
                    dateTime: startDateTime,
                    timeZone: 'America/Sao_Paulo',
                },
                end: {
                    dateTime: endDateTime,
                    timeZone: 'America/Sao_Paulo',
                },
                // Para contas @gmail.com gratuitas que bloqueiam a Service Account de criar salas Meet dinâmicas, o campo a seguir
                // não é incluído, em vez disso, criaremos o link gerando um short-id.
            };

            const calendarResponse = await calendar.events.insert({
                calendarId: calendarId,
                requestBody: event,
            });

            googleEventId = calendarResponse.data.id;
            // Para contas de serviço atreladas a Gmail grátis, forçamos um ID de sala amigável (o Meet aceita criar dinamicamente via link)
            // Se o Google enviou o oficial `hangoutLink`, usamos, senão construímos um baseado no Jitsi Meet
            // meet.jit.si agora bloqueia embeds em 5 min. Usamos um servidor Jitsi comunitário livre (meet.ffmuc.net) para salas ilimitadas.
            hangoutLink = calendarResponse.data.hangoutLink || `https://meet.ffmuc.net/vav-reuniao-${Date.now().toString().slice(-6)}`;

            // Adicionando a URL como propriedade de local/descrição para quem acessar o Google Calendar puro também enxergar.
            await calendar.events.patch({
                calendarId,
                eventId: googleEventId as string,
                requestBody: { location: hangoutLink }
            });

            console.log('Evento gerado com sucesso. Link Local:', hangoutLink);
        } else {
            console.warn('Aviso: GOOGLE_CALENDAR_ID não configurado. Ponto de falha, agendando apenas no BD.');
        }

        // 5. Salvar os dados e o Link gerado no Supabase
        const { data: newMeeting, error: insertError } = await supabase
            .from('meetings')
            .insert({
                title,
                description,
                date,
                start_time: `${start_time}:00`,
                end_time: `${end_time}:00`,
                meet_link: hangoutLink,
                created_by: user.id
            })
            .select()
            .single();

        if (insertError) {
            console.error('Erro ao salvar no Supabase:', insertError);
            throw new Error('Falha ao registrar a reunião no banco de dados.');
        }

        // 6. Finalização
        revalidatePath('/dashboard/reunioes'); // Revalida a listagem

        return {
            success: true,
            data: newMeeting,
            message: 'Reunião agendada com sucesso!'
        };

    } catch (error: any) {
        console.error('Erro no Catch Geral [createMeetingAction]:', error);
        return {
            success: false,
            message: error.message || 'Erro inesperado ao criar reunião.'
        };
    }
}

export async function deleteMeetingAction(meetingId: string) {
    try {
        const supabase = await createClient();

        // 1. Validar usuário autenticado
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error('Usuário não autenticado.');
        }

        // 2. Verificar permissão de role
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        const allowedRoles = ['Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia']
        if (!profile || !allowedRoles.includes(profile.role)) {
            throw new Error('Sem permissão para excluir reuniões.')
        }

        // 3. Apagar no Supabase
        const { error: deleteError } = await supabase
            .from('meetings')
            .delete()
            .eq('id', meetingId);

        if (deleteError) {
            console.error('Erro ao deletar no Supabase:', deleteError);
            throw new Error('Falha ao excluir a reunião do banco de dados.');
        }

        // 3. Revalidação da tela
        revalidatePath('/dashboard/reunioes');

        return {
            success: true,
            message: 'Reunião excluída com sucesso!'
        };
    } catch (error: any) {
        console.error('Erro ao excluir reunião [deleteMeetingAction]:', error);
        return {
            success: false,
            message: error.message || 'Erro inesperado ao excluir reunião.'
        };
    }
}
