import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { email, password, fullName, role } = await req.json();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Email, mot de passe et nom requis' }, { status: 400 });
    }

    if (role && role !== 'user' && role !== 'superadmin') {
      return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caracteres' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Cet email est deja utilise' }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    const user = await db.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: role || (email === 'admin@qrdomotik.roomscan.pro' ? 'superadmin' : 'user'),
      },
    });

    await db.home.create({
      data: {
        name: 'Ma Maison',
        ownerId: user.id,
        address: '',
      },
    });

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
