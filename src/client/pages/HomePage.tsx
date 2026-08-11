import { Link } from 'react-router-dom';
import { useSession } from 'modelence/client';
import {
  Cpu,
  ShieldCheck,
  LayoutPanelLeft,
  RefreshCcw,
  Headset,
  Swords,
  ChevronRight,
  Play,
} from 'lucide-react';
import { Seo } from '@/client/components/Seo';
import { Button } from '@/client/components/ui/Button';

const FEATURES = [
  {
    icon: Cpu,
    title: 'Максимальная производительность',
    text: 'Оптимизированное ядро без просадок FPS — клиент работает плавно даже в замесах на 100+ игроков.',
  },
  {
    icon: ShieldCheck,
    title: 'Обход анти-читов',
    text: 'Многоуровневая система защиты и регулярные байпасы под популярные серверы и анти-читы.',
  },
  {
    icon: LayoutPanelLeft,
    title: 'Удобный интерфейс',
    text: 'Минималистичный ClickGUI с поиском модулей, биндами и профилями конфигов в пару кликов.',
  },
  {
    icon: RefreshCcw,
    title: 'Постоянные обновления',
    text: 'Фоновые обновления без переустановки: новые функции и фиксы прилетают автоматически.',
  },
  {
    icon: Headset,
    title: 'Приоритетная поддержка',
    text: 'Быстрые ответы от команды поддержки 24/7 — поможем с установкой, настройкой и конфигами.',
  },
  {
    icon: Swords,
    title: 'Боевой арсенал',
    text: 'Продвинутые combat-модули, скрипты и тонкая настройка под ваш стиль игры.',
  },
];

export default function HomePage() {
  const { user } = useSession();

  return (
    <div className="min-h-screen bg-void text-frost overflow-x-hidden">
      <Seo />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-edge/60 bg-void/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#top" className="font-display font-black text-lg tracking-widest select-none">
            VENGE<span className="text-blood">ANCE</span>
          </a>
          <nav className="hidden md:flex items-center gap-8 text-sm text-mist">
            <a href="#features" className="hover:text-frost transition-colors">Преимущества</a>
            <a href="#video" className="hover:text-frost transition-colors">Видео</a>
            <a href="#join" className="hover:text-frost transition-colors">Купить</a>
          </nav>
          {user ? (
            <Link to="/logout">
              <Button variant="outline" size="sm">{user.handle} · Выйти</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="outline" color="primary" size="sm">Войти</Button>
            </Link>
          )}
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section id="top" className="relative pt-40 pb-28 px-4 sm:px-6">
        {/* background glows */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[48rem] h-[48rem] rounded-full bg-blood/15 blur-[140px] animate-glow-pulse" />
          <div className="absolute top-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-hex/10 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.25]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(139,92,246,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(139,92,246,0.07) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent)',
            }}
          />
        </div>

        <div className="relative max-w-4xl mx-auto text-center stagger">
          <span className="inline-flex items-center gap-2 rounded-full border border-blood/40 bg-blood-soft px-4 py-1.5 text-xs font-semibold tracking-widest text-blood-bright uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-blood animate-glow-pulse" />
            Release · Minecraft 1.21.11
          </span>

          <h1 className="mt-8 text-4xl sm:text-6xl md:text-7xl font-black leading-[1.05] tracking-tight">
            VENGE<span className="text-blood drop-shadow-[0_0_28px_rgba(230,46,77,0.55)]">ANCE</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-mist max-w-2xl mx-auto leading-relaxed">
            Перестань оглядываться на правила — возьми от игры максимум.
            Приватный клиент нового поколения для Minecraft 1.21.11.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="#join">
              <Button color="primary" size="lg" rightIcon={<ChevronRight className="size-4" />}>
                Получить Vengeance
              </Button>
            </a>
            <a href="#features">
              <Button variant="outline" size="lg">
                Преимущества
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────── */}
      <section id="features" className="relative py-24 px-4 sm:px-6 bg-abyss border-y border-edge/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-semibold tracking-[0.3em] text-blood-bright uppercase">Преимущества</span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-bold">Почему Vengeance?</h2>
            <p className="mt-4 text-mist">
              Ключевые особенности, которые выделяют Vengeance среди конкурентов.
            </p>
          </div>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 stagger">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div
                key={title}
                className="group relative rounded-panel border border-edge bg-surface p-6 transition-all duration-300 hover:border-blood/50 hover:bg-surface-2 hover:-translate-y-1 hover:shadow-[0_12px_40px_-12px_rgba(230,46,77,0.35)]"
              >
                <div className="flex size-11 items-center justify-center rounded-ctrl border border-edge bg-abyss text-blood-bright transition-colors group-hover:border-blood/50 group-hover:bg-blood-soft">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-5 font-display text-base font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-mist">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Video ───────────────────────────────────────────── */}
      <section id="video" className="py-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <span className="text-xs font-semibold tracking-[0.3em] text-blood-bright uppercase">Видео</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold">Vengeance в действии</h2>
          <p className="mt-4 text-mist">Официальный обзор клиента.</p>

          <div className="mt-10 relative aspect-video rounded-panel border border-edge bg-surface overflow-hidden">
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/RVKG5hKtqiY"
              title="Vengeance — официальный обзор"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section id="join" className="relative py-24 px-4 sm:px-6 border-t border-edge/60 overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute bottom-[-14rem] left-1/2 -translate-x-1/2 w-[40rem] h-[28rem] rounded-full bg-blood/15 blur-[120px]" />
        </div>
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold leading-tight">
            Всё лучшее — <span className="text-blood">у нас</span>
          </h2>
          <p className="mt-5 text-lg text-mist">
            Присоединяйся к Vengeance и доминируй на любом сервере уже сегодня.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to={user ? '/' : '/signup'}>
              <Button color="primary" size="lg" rightIcon={<ChevronRight className="size-4" />}>
                {user ? 'Личный кабинет — скоро' : 'Создать аккаунт'}
              </Button>
            </Link>
            <a href="https://funpay.com/users/13892702/" target="_blank" rel="noopener noreferrer">
              <Button variant="soft" size="lg">
                Купить
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-edge/60 bg-abyss px-4 sm:px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <p className="font-display text-sm font-bold tracking-widest">
              VENGE<span className="text-blood">ANCE</span>
            </p>
            <p className="mt-2 text-xs text-dusk">
              © 2026 Vengeance Client. Все права защищены.
            </p>
            <p className="mt-1 text-xs text-dusk">
              Наш продукт не аффилирован с © Mojang и © Microsoft.
            </p>
          </div>
          <nav className="flex items-center gap-6 text-sm text-mist">
            <a href="https://t.me/vengeanceclient" target="_blank" rel="noopener noreferrer" className="hover:text-frost transition-colors">Telegram</a>
            <a href="https://t.me/onkez" target="_blank" rel="noopener noreferrer" className="hover:text-frost transition-colors">Support</a>
            <a href="#features" className="hover:text-frost transition-colors">Преимущества</a>
            <Link to="/terms" className="hover:text-frost transition-colors">Условия использования</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
