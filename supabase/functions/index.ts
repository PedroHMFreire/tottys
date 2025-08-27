// supabase/functions/index.ts
// Função para criar novo usuário (Auth), garantir profile, papel e áreas — só OWNER pode chamar.

import dotenv from 'dotenv'
import express from 'express'
import { createClient } from '@supabase/supabase-js'

dotenv.config()
const app = express()
app.use(express.json())

const supabaseUrl = process.env.SUPABASE_URL as string
const anonKey = process.env.SUPABASE_ANON_KEY as string
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string

app.post('/admin_create_user', async (req, res) => {
  // Cliente autenticado (pega o usuário que chamou)
  const supa = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers['authorization'] || '' } },
  })
  // Cliente admin (service role)
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    const { email, password, name, role = 'VENDEDOR', areas = [], sendInvite = true } = req.body
    if (!email) return res.status(400).json({ error: 'email obrigatório' })

    // Quem está chamando?
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return res.status(401).json({ error: 'não autenticado' })

    // Perfil do chamador (precisa ser OWNER)
    const { data: caller } = await supa
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle()

    const company_id = caller?.company_id
    const callerRole = caller?.role
    if (!company_id) return res.status(400).json({ error: 'perfil sem company_id' })
    if (callerRole !== 'OWNER') return res.status(403).json({ error: 'apenas OWNER pode criar usuários' })

    // Criar usuário na Auth
    let created
    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { company_id },
      })
      if (error) throw error
      created = data.user
    } else {
      if (!password) return res.status(400).json({ error: 'password obrigatório quando sendInvite=false' })
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { company_id },
      })
      if (error) throw error
      created = data.user
    }

    const user_id = created.id

    // Garantir profile + papel
    await admin.from('profiles').upsert(
      { id: user_id, company_id, role, nome: name ?? null, email },
      { onConflict: 'id' },
    )

    // Papel via função (mantém a regra de OWNER)
    await admin.rpc('set_user_role', { p_user_id: user_id, p_role: role })

    // Conceder áreas extras
    if (Array.isArray(areas)) {
      for (const code of areas) {
        await admin.rpc('grant_user_area', { p_user_id: user_id, p_area_code: code })
      }
    }

    return res.status(200).json({ ok: true, user_id })
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Admin create user function running on port ${PORT}`)
})
