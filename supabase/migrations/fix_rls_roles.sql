-- =========================================================================
-- PATCH: Corrigir todos os nomes de roles nas funções e políticas RLS
-- Roles antigos → Roles atuais do sistema
-- =========================================================================

-- Roles atuais:
-- 'Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia',
-- 'Estagiário(a) de ADM', 'Estagiário(a) de Comunicação',
-- 'Estagiário(a) de Pedagogia', 'Educador'

-- =========================================================================
-- 1. FUNÇÕES AUXILIARES (recriar com roles corretos)
-- =========================================================================

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Presidência', 'Direção')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_coordination()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_pedagogia_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Presidência', 'Direção', 'Coordenação de Pedagogia', 'Estagiário(a) de Pedagogia', 'Educador')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_comunicacao_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia', 'Estagiário(a) de Comunicação', 'Estagiário(a) de ADM', 'Estagiário(a) de Pedagogia', 'Educador')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_adm_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('Presidência', 'Direção', 'Coordenadora ADM', 'Estagiário(a) de ADM')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 2. TABELA: demands — recriar políticas
-- =========================================================================

DROP POLICY IF EXISTS "Demands: Read Access" ON demands;
DROP POLICY IF EXISTS "Demands: Create Access (Coord. Geral Only)" ON demands;
DROP POLICY IF EXISTS "Demands: Update Own or Admin" ON demands;
DROP POLICY IF EXISTS "Demands: Delete Access (Coord. Geral Only)" ON demands;

CREATE POLICY "demands_select" ON demands FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (
        'Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia',
        'Estagiário(a) de ADM', 'Estagiário(a) de Comunicação', 'Estagiário(a) de Pedagogia', 'Educador'
    )));

CREATE POLICY "demands_insert" ON demands FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (
        'Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia'
    )));

CREATE POLICY "demands_update" ON demands FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (
        'Presidência', 'Direção', 'Coordenadora ADM', 'Coordenação de Pedagogia'
    )));

CREATE POLICY "demands_delete" ON demands FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN (
        'Presidência', 'Direção'
    )));

-- =========================================================================
-- 3. TABELA: demand_comments — recriar políticas
-- =========================================================================

DROP POLICY IF EXISTS "DemandComments: Read" ON demand_comments;
DROP POLICY IF EXISTS "DemandComments: Insert" ON demand_comments;
DROP POLICY IF EXISTS "DemandComments: Update Own" ON demand_comments;
DROP POLICY IF EXISTS "DemandComments: Delete Own or Admin" ON demand_comments;

CREATE POLICY "demand_comments_select" ON demand_comments FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

CREATE POLICY "demand_comments_insert" ON demand_comments FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()));

CREATE POLICY "demand_comments_update" ON demand_comments FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR is_admin());

CREATE POLICY "demand_comments_delete" ON demand_comments FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR is_admin());

-- =========================================================================
-- 4. TABELA: financial_entries (admin) — recriar políticas
-- =========================================================================

DROP POLICY IF EXISTS "Financial: Read for ADM roles" ON financial_entries;
DROP POLICY IF EXISTS "Financial: Insert for ADM roles" ON financial_entries;
DROP POLICY IF EXISTS "Financial: Update for ADM roles" ON financial_entries;
DROP POLICY IF EXISTS "Financial: Delete for ADM roles" ON financial_entries;

CREATE POLICY "financial_select" ON financial_entries FOR SELECT TO authenticated
    USING (is_adm_user());

CREATE POLICY "financial_insert" ON financial_entries FOR INSERT TO authenticated
    WITH CHECK (is_adm_user());

CREATE POLICY "financial_update" ON financial_entries FOR UPDATE TO authenticated
    USING (is_adm_user());

CREATE POLICY "financial_delete" ON financial_entries FOR DELETE TO authenticated
    USING (is_adm_user());

-- =========================================================================
-- 5. TABELA: banks — recriar políticas
-- =========================================================================

DROP POLICY IF EXISTS "Banks: Read for ADM roles" ON banks;
DROP POLICY IF EXISTS "Banks: Insert for ADM roles" ON banks;
DROP POLICY IF EXISTS "Banks: Update for ADM roles" ON banks;
DROP POLICY IF EXISTS "Banks: Delete for ADM roles" ON banks;

CREATE POLICY "banks_select" ON banks FOR SELECT TO authenticated USING (is_adm_user());
CREATE POLICY "banks_insert" ON banks FOR INSERT TO authenticated WITH CHECK (is_adm_user());
CREATE POLICY "banks_update" ON banks FOR UPDATE TO authenticated USING (is_adm_user());
CREATE POLICY "banks_delete" ON banks FOR DELETE TO authenticated USING (is_adm_user());

-- =========================================================================
-- 6. TABELA: communication_assets, communication_folders, etc.
-- =========================================================================

DROP POLICY IF EXISTS "Assets: Read" ON communication_assets;
DROP POLICY IF EXISTS "Assets: Insert" ON communication_assets;
DROP POLICY IF EXISTS "Assets: Update" ON communication_assets;
DROP POLICY IF EXISTS "Assets: Delete" ON communication_assets;

CREATE POLICY "assets_select" ON communication_assets FOR SELECT TO authenticated USING (is_comunicacao_user());
CREATE POLICY "assets_insert" ON communication_assets FOR INSERT TO authenticated WITH CHECK (is_comunicacao_user());
CREATE POLICY "assets_update" ON communication_assets FOR UPDATE TO authenticated USING (is_comunicacao_user());
CREATE POLICY "assets_delete" ON communication_assets FOR DELETE TO authenticated USING (is_comunicacao_user());

DROP POLICY IF EXISTS "Folders: Read" ON communication_folders;
DROP POLICY IF EXISTS "Folders: Insert" ON communication_folders;
DROP POLICY IF EXISTS "Folders: Update" ON communication_folders;
DROP POLICY IF EXISTS "Folders: Delete" ON communication_folders;

CREATE POLICY "comm_folders_select" ON communication_folders FOR SELECT TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_folders_insert" ON communication_folders FOR INSERT TO authenticated WITH CHECK (is_comunicacao_user());
CREATE POLICY "comm_folders_update" ON communication_folders FOR UPDATE TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_folders_delete" ON communication_folders FOR DELETE TO authenticated USING (is_comunicacao_user());

DROP POLICY IF EXISTS "Files: Read" ON communication_files;
DROP POLICY IF EXISTS "Files: Insert" ON communication_files;
DROP POLICY IF EXISTS "Files: Update" ON communication_files;
DROP POLICY IF EXISTS "Files: Delete" ON communication_files;

CREATE POLICY "comm_files_select" ON communication_files FOR SELECT TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_files_insert" ON communication_files FOR INSERT TO authenticated WITH CHECK (is_comunicacao_user());
CREATE POLICY "comm_files_update" ON communication_files FOR UPDATE TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_files_delete" ON communication_files FOR DELETE TO authenticated USING (is_comunicacao_user());

DROP POLICY IF EXISTS "Posts: Read" ON communication_posts;
DROP POLICY IF EXISTS "Posts: Insert" ON communication_posts;
DROP POLICY IF EXISTS "Posts: Update" ON communication_posts;
DROP POLICY IF EXISTS "Posts: Delete" ON communication_posts;

CREATE POLICY "comm_posts_select" ON communication_posts FOR SELECT TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_posts_insert" ON communication_posts FOR INSERT TO authenticated WITH CHECK (is_comunicacao_user());
CREATE POLICY "comm_posts_update" ON communication_posts FOR UPDATE TO authenticated USING (is_comunicacao_user());
CREATE POLICY "comm_posts_delete" ON communication_posts FOR DELETE TO authenticated USING (is_comunicacao_user());

-- =========================================================================
-- 7. TABELA: approval_submissions — recriar políticas
-- =========================================================================

DROP POLICY IF EXISTS "ApprovalSubmissions: Read" ON approval_submissions;
DROP POLICY IF EXISTS "ApprovalSubmissions: Insert" ON approval_submissions;
DROP POLICY IF EXISTS "ApprovalSubmissions: Update" ON approval_submissions;
DROP POLICY IF EXISTS "ApprovalSubmissions: Delete" ON approval_submissions;

CREATE POLICY "approval_select" ON approval_submissions FOR SELECT TO authenticated
    USING (submitted_by = auth.uid() OR is_coordination());

CREATE POLICY "approval_insert" ON approval_submissions FOR INSERT TO authenticated
    WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "approval_update" ON approval_submissions FOR UPDATE TO authenticated
    USING (is_coordination());

CREATE POLICY "approval_delete" ON approval_submissions FOR DELETE TO authenticated
    USING (is_admin());

-- =========================================================================
-- 8. TABELA: google_drive_config
-- =========================================================================

DROP POLICY IF EXISTS "DriveConfig: Read" ON google_drive_config;
DROP POLICY IF EXISTS "DriveConfig: Insert" ON google_drive_config;
DROP POLICY IF EXISTS "DriveConfig: Update" ON google_drive_config;
DROP POLICY IF EXISTS "DriveConfig: Delete" ON google_drive_config;

CREATE POLICY "drive_config_all" ON google_drive_config FOR ALL TO authenticated
    USING (is_comunicacao_user()) WITH CHECK (is_comunicacao_user());

-- =========================================================================
-- 9. FUNÇÃO: join_channel (chat) — corrigir roles
-- =========================================================================

CREATE OR REPLACE FUNCTION join_channel(channel_name TEXT)
RETURNS VOID AS $$
DECLARE
    room_id UUID;
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM profiles WHERE id = auth.uid();

    SELECT id INTO room_id FROM rooms WHERE name = channel_name AND type = 'channel';
    IF room_id IS NULL THEN RETURN; END IF;

    IF user_role IN ('Presidência', 'Direção', 'Coordenadora ADM') THEN
        INSERT INTO room_participants (room_id, user_id) VALUES (room_id, auth.uid()) ON CONFLICT DO NOTHING;
    ELSIF channel_name = 'Coordenação' AND user_role IN ('Coordenação de Pedagogia') THEN
        INSERT INTO room_participants (room_id, user_id) VALUES (room_id, auth.uid()) ON CONFLICT DO NOTHING;
    ELSIF channel_name = 'Pedagogia' AND user_role IN ('Coordenação de Pedagogia', 'Estagiário(a) de Pedagogia', 'Educador') THEN
        INSERT INTO room_participants (room_id, user_id) VALUES (room_id, auth.uid()) ON CONFLICT DO NOTHING;
    ELSIF channel_name = 'Comunicação' AND user_role IN ('Estagiário(a) de Comunicação', 'Coordenação de Pedagogia') THEN
        INSERT INTO room_participants (room_id, user_id) VALUES (room_id, auth.uid()) ON CONFLICT DO NOTHING;
    ELSIF channel_name = 'Geral' THEN
        INSERT INTO room_participants (room_id, user_id) VALUES (room_id, auth.uid()) ON CONFLICT DO NOTHING;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 10. WHITELIST — corrigir roles no seed
-- =========================================================================

UPDATE whitelist SET role = 'Coordenadora ADM'        WHERE full_name = 'Evelin Salles';
UPDATE whitelist SET role = 'Presidência'              WHERE full_name = 'Juracy Bahia';
UPDATE whitelist SET role = 'Direção'                  WHERE full_name = 'Ramon Carneiro';
UPDATE whitelist SET role = 'Coordenação de Pedagogia' WHERE full_name = 'Pamella Vianna';
UPDATE whitelist SET role = 'Educador'                 WHERE full_name = 'Patrícia Santana';
UPDATE whitelist SET role = 'Estagiário(a) de Pedagogia' WHERE full_name = 'MAISLA';

-- Atualizar profiles que já foram criados com roles antigos
UPDATE profiles SET role = 'Coordenadora ADM'          WHERE role = 'Coord. Geral';
UPDATE profiles SET role = 'Presidência'               WHERE role = 'Presidente';
UPDATE profiles SET role = 'Direção'                   WHERE role = 'Dir. Financeiro';
UPDATE profiles SET role = 'Coordenação de Pedagogia'  WHERE role = 'Coord. Pedagógica';
UPDATE profiles SET role = 'Educador'                  WHERE role = 'Educadora';
UPDATE profiles SET role = 'Estagiário(a) de Pedagogia' WHERE role = 'Estágio Pedagógico';
UPDATE profiles SET role = 'Estagiário(a) de ADM'     WHERE role = 'Estágio ADM';
UPDATE profiles SET role = 'Estagiário(a) de Comunicação' WHERE role = 'Comunicação';

-- =========================================================================
-- 11. COORDINATION NOTES — corrigir políticas
-- =========================================================================

DROP POLICY IF EXISTS "notes_select" ON coordination_notes;
DROP POLICY IF EXISTS "notes_insert" ON coordination_notes;
DROP POLICY IF EXISTS "notes_update" ON coordination_notes;
DROP POLICY IF EXISTS "notes_delete" ON coordination_notes;

CREATE POLICY "notes_select" ON coordination_notes FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR is_coordination());

CREATE POLICY "notes_insert" ON coordination_notes FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "notes_update" ON coordination_notes FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR is_coordination());

CREATE POLICY "notes_delete" ON coordination_notes FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR is_admin());
