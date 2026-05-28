'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProfileNameAction(newName: string) {
    try {
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            throw new Error('Usuário não autenticado.');
        }

        if (!newName || newName.trim().length < 2) {
            throw new Error('O nome deve ter pelo menos 2 caracteres.');
        }

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ full_name: newName.trim() })
            .eq('id', user.id);

        if (updateError) {
            throw new Error('Falha ao atualizar o nome no banco de dados.');
        }

        revalidatePath('/dashboard/configuracoes');

        return { success: true, message: 'Nome atualizado com sucesso!' };
    } catch (error: any) {
        return { success: false, message: error.message || 'Erro inesperado ao atualizar o nome.' };
    }
}
