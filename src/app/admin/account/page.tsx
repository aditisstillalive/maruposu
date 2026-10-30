import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import PageHeader from '@/components/admin/PageHeader';
import PasswordForm from './password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Akun | Admin' };

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  return (
    <div className="p-4 md:p-8">
      <PageHeader title="Akun" description={`Masuk sebagai ${session?.user?.email ?? '-'}`} />
      <PasswordForm />
    </div>
  );
}
