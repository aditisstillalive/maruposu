import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import { rateLimit } from '@/lib/rate-limit';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        // Throttle per account and per IP to slow down password guessing.
        const forwarded = req?.headers?.['x-forwarded-for'];
        const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim() || 'unknown';
        const email = credentials.email.toLowerCase();
        const allowed = rateLimit(`login:email:${email}`, 10, LOGIN_WINDOW_MS)
          && rateLimit(`login:ip:${ip}`, 30, LOGIN_WINDOW_MS);
        if (!allowed) return null;
        
        const adminUser = await prisma.adminUser.findUnique({
          where: { email: credentials.email },
        });
        
        if (!adminUser || !adminUser.password) return null;
        
        const isValid = await bcrypt.compare(credentials.password, adminUser.password);
        
        if (!isValid) return null;
        
        return { id: adminUser.id, email: adminUser.email, role: adminUser.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
};