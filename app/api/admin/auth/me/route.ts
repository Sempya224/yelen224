import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_JWT_SECRET!)

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('yelen224_admin_session')?.value

    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'yelen224-admin',
      audience: 'yelen224-admin-dashboard',
    })

    return NextResponse.json({
      admin: {
        id: payload.adminId,
        email: payload.email,
        role: payload.role,
        nom: payload.nom,
      }
    })

  } catch {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 })
  }
}