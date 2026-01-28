import { useState } from 'react';

interface AuthFormProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegisterInitiate: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegisterVerify: (email: string, code: string) => Promise<{ success: boolean; error?: string }>;
}

export function AuthForm({ onLogin, onRegisterInitiate, onRegisterVerify }: AuthFormProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isLogin) {
      const result = await onLogin(email, password);
      setLoading(false);
      if (!result.success) {
        setError(result.error || 'An error occurred');
      }
    } else if (pendingVerification) {
      const result = await onRegisterVerify(email, code);
      setLoading(false);
      if (!result.success) {
        setError(result.error || 'An error occurred');
      }
    } else {
      const result = await onRegisterInitiate(email, password);
      setLoading(false);
      if (result.success) {
        setPendingVerification(true);
      } else {
        setError(result.error || 'An error occurred');
      }
    }
  };

  const getTitle = () => {
    if (isLogin) return 'Sign in to your account';
    if (pendingVerification) return 'Enter verification code';
    return 'Create a new account';
  };

  const getButtonText = () => {
    if (loading) return 'Please wait...';
    if (isLogin) return 'Sign In';
    if (pendingVerification) return 'Verify';
    return 'Create Account';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
          NurseCal
        </h1>
        <p className="text-center text-gray-600 mb-6">
          {getTitle()}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!pendingVerification && (
            <>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
                />
              </div>
            </>
          )}

          {pendingVerification && (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                A verification code has been sent. Check your server logs for the code.
              </p>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-2xl tracking-widest"
                placeholder="000000"
              />
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {getButtonText()}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setPendingVerification(false);
              setCode('');
            }}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
