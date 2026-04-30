// Supabase Edge Function: admin_create_user
// Creates an auth user and provisions profile/areas. Only OWNER/ADMIN/GERENTE can call.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('authorization') ?? ''
    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const admin = createClient(supabaseUrl, serviceKey)

    const body = await req.json()
    const { email, password, name, role = 'COLABORADOR', cargo = null, areas = [], sendInvite = true, company_id: bodyCompanyId } = body || {}
    if (!email) return new Response(JSON.stringify({ error: 'email obrigatório' }), { status: 400, headers: corsHeaders })

    const { data: { user } } = await supa.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'não autenticado' }), { status: 401, headers: corsHeaders })

    const { data: caller } = await supa
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .maybeSingle()

    let company_id = caller?.company_id
    const callerRole = caller?.role
    if (!company_id) return new Response(JSON.stringify({ error: 'perfil sem company_id' }), { status: 400, headers: corsHeaders })
    if (!['OWNER', 'ADMIN', 'GERENTE'].includes(callerRole)) {
      return new Response(JSON.stringify({ error: 'sem permissão para criar usuários' }), { status: 403, headers: corsHeaders })
    }

    // Validar que GERENTE não cria ADMIN ou OWNER
    const { role: bodyRole = 'COLABORADOR' } = body || {}
    if (callerRole === 'GERENTE' && !['COLABORADOR'].includes(bodyRole)) {
      return new Response(JSON.stringify({ error: 'GERENTE só pode criar COLABORADOR' }), { status: 403, headers: corsHeaders })
    }
    if (callerRole === 'OWNER' && bodyCompanyId) {
      company_id = bodyCompanyId
    }

    let created
    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { company_id } })
      if (error) throw error
      created = data.user
    } else {
      if (!password) return new Response(JSON.stringify({ error: 'password obrigatório quando sendInvite=false' }), { status: 400, headers: corsHeaders })
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

    await admin.from('profiles').upsert(
      { id: user_id, company_id, role, cargo: cargo ?? null, nome: name ?? null, email },
      { onConflict: 'id' },
    )

    await admin.rpc('set_user_role', { p_user_id: user_id, p_role: role })

    if (Array.isArray(areas)) {
      for (const code of areas) {
        await admin.rpc('grant_user_area', { p_user_id: user_id, p_area_code: code })
      }
    }

    return new Response(JSON.stringify({ ok: true, user_id }), { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), { status: 500, headers: corsHeaders })
  }
})
