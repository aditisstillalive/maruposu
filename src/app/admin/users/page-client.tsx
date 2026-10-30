'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

interface UsersPageProps {
  initialUsers: Array<{
    id: string;
    email: string;
    role: string;
    added_by: string | null;
    created_at: string;
  }>;
  currentUserEmail: string;
}

export default function UsersPageClient({ initialUsers, currentUserEmail }: UsersPageProps) {
  const [users, setUsers] = useState(initialUsers);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'super_admin'>('admin');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError('');
    
    if (!newPassword) {
      setError('Password is required');
      setIsCreating(false);
      return;
    }
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, role: newRole }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create admin');
      
      setUsers([data, ...users]);
      setShowCreateModal(false);
      setNewEmail('');
      setNewRole('admin');
      setSuccess('Admin added successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this admin?')) return;
    
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to remove admin');
      
      setUsers(users.filter(u => u.id !== id));
      setSuccess('Admin removed successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove admin');
    }
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    setNewEmail('');
    setNewPassword('');
    setNewRole('admin');
    setError('');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-light tracking-tight">User Management</h1>
        <Button onClick={() => setShowCreateModal(true)}>
          Add Admin
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {success}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Role</th>
              <th className="p-3 text-left">Added By</th>
              <th className="p-3 text-left">Created</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b hover:bg-muted/50">
                <td className="p-3 font-medium">{user.email}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.role === 'super_admin' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-3 text-sm text-muted-foreground">{user.added_by || '-'}</td>
                <td className="p-3 text-sm text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString('id-ID', { 
                    day: '2-digit', month: 'short', year: 'numeric' 
                  })}
                </td>
                <td className="p-3">
                  {user.email !== currentUserEmail && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Remove ${user.email} as admin?`)) {
                          handleRemove(user.id);
                        }
                      }}
                    >
                      Remove
                    </Button>
                  )}
                  {user.email === currentUserEmail && (
                    <span className="text-muted-foreground text-sm">Current user</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={handleCloseModal}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>Add New Admin</CardTitle>
              <Button variant="ghost" size="icon" onClick={handleCloseModal}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 10 characters"
                  required
                  disabled={isCreating}
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newRole === 'admin'}
                      onChange={() => setNewRole('admin')}
                      className="h-4 w-4"
                    />
                    Admin
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="super_admin"
                      checked={newRole === 'super_admin'}
                      onChange={() => setNewRole('super_admin')}
                      className="h-4 w-4"
                    />
                    Super Admin
                  </label>
                </div>
              </div>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                  {error}
                </div>
              )}
              <div className="flex gap-3">
                <Button type="submit" disabled={isCreating} className="flex-1">
                  {isCreating ? 'Adding...' : 'Add Admin'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCloseModal} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}