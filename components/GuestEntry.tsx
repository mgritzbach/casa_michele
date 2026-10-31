import React, { useState } from 'react';
import { ArrowLeft, Mail, MessageCircle, WifiOff } from 'lucide-react';
import { Button } from './UI';
import { Capacitor } from '@capacitor/core';

export function GuestEntry({ code, busy, online, checked, onBack, onJoin, onRetry }: {
  code: string | null; busy: boolean; online: boolean; checked: boolean; onBack: () => void;
  onRetry: () => void; onJoin: (code: string, name: string, phone?: string, email?: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<'email' | 'whatsapp'>('email');
  const [error, setError] = useState('');
  return <main className="min-h-screen bg-zinc-950 p-6 flex flex-col">
    <button onClick={onBack} aria-label="Back" className="w-11 h-11 flex items-center justify-center rounded-lg bg-zinc-900"><ArrowLeft size={20} /></button>
    <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-8">
      <h1 className="text-3xl font-semibold mb-2">Join the event</h1>
      <p className="text-zinc-400 mb-8">Your name and one way for the bartender to reach you. No account needed.</p>
      {code && !Capacitor.isNativePlatform() && <a className="text-amber-300 underline min-h-11 mb-3" href={`casamichele://join?code=${encodeURIComponent(code)}`}>Open in the installed Android app</a>}
      {!checked ? <p role="status" className="text-zinc-300 py-6">Checking the connection...</p> : !online ? <div role="status" className="space-y-4 bg-zinc-900 rounded-2xl p-6">
        <WifiOff className="text-amber-400" /><h2 className="text-xl font-semibold">Internet needed for guests</h2>
        {code && <p className="text-sm text-zinc-300">Event <strong>{code}</strong></p>}
        <p className="text-zinc-400">Connect to the internet to join and send orders to the bar.</p>
        <Button onClick={onRetry}>Try again</Button>
      </div> : <form className="space-y-5" onSubmit={async event => {
        event.preventDefault(); setError('');
        const data = new FormData(event.currentTarget);
        try {
          await onJoin(code || String(data.get('code')), String(data.get('name')).trim(),
            method === 'whatsapp' ? String(data.get('contact')).replace(/[\s()-]/g, '') : undefined,
            method === 'email' ? String(data.get('contact')).trim() : undefined);
        } catch (cause) { setError((cause as Error).message); }
      }}>
        <label className="block text-sm font-medium">Your name
          <input className="input-field mt-2 h-14" name="name" autoComplete="name" required maxLength={60} />
        </label>
        <fieldset><legend className="text-sm font-medium mb-2">Contact method</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['email', 'whatsapp'] as const).map(option => <button type="button" key={option}
              aria-pressed={method === option} onClick={() => setMethod(option)}
              className={`h-12 rounded-xl border flex gap-2 items-center justify-center ${method === option ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'border-zinc-700 text-zinc-300'}`}>
              {option === 'email' ? <Mail size={17} /> : <MessageCircle size={17} />}{option === 'email' ? 'Email' : 'WhatsApp'}
            </button>)}
          </div>
        </fieldset>
        <label className="block text-sm font-medium">{method === 'email' ? 'Email address' : 'WhatsApp number'}
          <input key={method} className="input-field mt-2 h-14" name="contact" required
            type={method === 'email' ? 'email' : 'tel'} autoComplete={method === 'email' ? 'email' : 'tel'}
            placeholder={method === 'email' ? 'you@example.com' : '+49 170 1234567'}
            maxLength={method === 'email' ? 254 : 30} pattern={method === 'whatsapp' ? '\\+[0-9 ()-]{7,25}' : undefined} />
        </label>
        {method === 'whatsapp' && <p className="text-xs text-zinc-400">Enter the number you use in WhatsApp, including your country code.</p>}
        {code ? <p className="bg-zinc-900 p-4 rounded-xl">Event <strong className="float-right tracking-widest">{code}</strong></p>
          : <label className="block text-sm font-medium">Event code<input className="input-field mt-2 h-14 uppercase" name="code" required minLength={4} maxLength={12} pattern="[A-Za-z0-9]+" autoCapitalize="characters" /></label>}
        <p className="text-xs text-zinc-400">Your contact details are shared with this event's bartender, not other guests.</p>
        {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Joining...' : 'Join event'}</Button>
      </form>}
    </div>
  </main>;
}
