import React, { useCallback, useState } from 'react';
import { signupWithPassword } from 'modelence/client';
import { Button } from '@/client/components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/client/components/ui/Card';
import { Input } from '@/client/components/ui/Input';
import { Label } from '@/client/components/ui/Label';
import { Link } from 'react-router-dom';
import Page from '@/client/components/Page';
import { toast } from 'react-hot-toast';

export default function SignupPage() {
  return (
    <Page seo={{ title: 'Регистрация', noindex: true }}>
      <div className="flex items-center justify-center min-h-full animate-fade-up">
        <SignupForm />
      </div>
    </Page>
  );
}

function SignupForm() {
  const [isSignupSuccess, setIsSignupSuccess] = useState(false);

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const email = String(formData.get('email'));
    const password = String(formData.get('password'));
    const confirmPassword = String(formData.get('confirmPassword'));

    if (password !== confirmPassword) {
      toast.error('Пароли не совпадают');
      return;
    }

    try {
      await signupWithPassword({ email, password });
      setIsSignupSuccess(true);
    } catch (error) {
      console.error((error as Error).message);
    }
  }, []);

  if (isSignupSuccess) {
    return (
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            Аккаунт создан
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-4">
          <p className="text-mist">
            Ваш аккаунт успешно создан.
          </p>
          <Link to="/login" className="w-full">
            <Button className="w-full" color="primary">
              Войти
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto">
      <CardHeader className="text-center">
        <p className="font-display font-black text-xs tracking-widest text-mist">
          VENGE<span className="text-blood">ANCE</span>
        </p>
        <CardTitle className="text-xl pt-2">
          Создать аккаунт
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
              required
            />
          </div>

          <div>
            <Label htmlFor="confirm-password" className="block mb-2">
              Повторите пароль
            </Label>
            <Input
              type="password"
              name="confirmPassword"
              id="confirm-password"
              required
            />
          </div>

          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="consent-terms"
                type="checkbox"
                name="consent-terms"
                className="w-4 h-4 border border-edge rounded bg-abyss accent-blood"
                required
              />
            </div>
            <div className="ml-3 text-sm">
              <Label htmlFor="consent-terms" className="text-mist">
                Я принимаю <a className="font-medium text-blood-bright hover:underline" href="/terms" target="_blank">условия использования</a>
              </Label>
            </div>
          </div>

          <Button
            className="w-full"
            color="primary"
            type="submit"
          >
            Создать аккаунт
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-center text-sm text-mist">
          Уже есть аккаунт?{' '}
          <Link
            to="/login"
            className="text-blood-bright underline hover:no-underline font-medium"
          >
            Войти
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
