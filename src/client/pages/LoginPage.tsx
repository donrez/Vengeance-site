import React, { useCallback } from 'react';
import { getConfig, loginWithPassword } from 'modelence/client';
import { Button } from '@/client/components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/client/components/ui/Card';
import { Input } from '@/client/components/ui/Input';
import { Label } from '@/client/components/ui/Label';
import { Link } from 'react-router-dom';
import Page from '@/client/components/Page';

export default function LoginPage() {
  return (
    <Page seo={{ title: 'Вход', noindex: true }}>
      <div className="flex items-center justify-center min-h-full animate-fade-up">
        <LoginForm />
      </div>
    </Page>
  );
}

function LoginForm() {
  const isSandboxEnv = getConfig('_system.env.type') === 'sandbox';
  const defaultDemoEmail = isSandboxEnv ? getConfig('example.modelenceDemoUsername') as string | undefined : undefined;
  const defaultDemoPassword = isSandboxEnv ? getConfig('example.modelenceDemoPassword') as string | undefined : undefined;

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    await loginWithPassword({ email, password });
  }, []);

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader className="text-center">
        <p className="font-display font-black text-xs tracking-widest text-mist">
          VENGE<span className="text-blood">ANCE</span>
        </p>
        <CardTitle className="text-xl pt-2">
          Вход в аккаунт
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email" className="block mb-2">
              Email
            </Label>
            <Input
              type="email"
              name="email"
              id="email"
              defaultValue={defaultDemoEmail}
              required
            />
          </div>

          <div>
            <Label htmlFor="password" className="block mb-2">
              Пароль
            </Label>
            <Input
              type="password"
              name="password"
              id="password"
              defaultValue={defaultDemoPassword}
              required
            />
          </div>

          <Button
            className="w-full"
            color="primary"
            type="submit"
          >
            Войти
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-center text-sm text-mist">
          Нет аккаунта?{' '}
          <Link
            to="/signup"
            className="text-blood-bright underline hover:no-underline font-medium"
          >
            Зарегистрироваться
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
