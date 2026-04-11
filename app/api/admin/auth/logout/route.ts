import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('yelen224_admin_session')?.value

    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET, {
          issuer: 'yelen224-admin',
          audience: 'yelen224-admin-dashboard',
        })

        // Log de déconnexion
        await supabaseAdmin.from('admin_logs').insert({
          admin_id: payload.sub,
          action: 'LOGOUT',
          details: { timestamp: new Date().toISOString() },
        })
      } catch {
        // Token invalide → on logout quand même
      }
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_admin_session')
    return response

  } catch {
    const response = NextResponse.json({ success: true })
    response.cookies.delete('yelen224_admin_session')
    return response
  }
}