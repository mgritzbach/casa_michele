import React from 'react';
import { ArrowUpRight, Wine, Lock } from 'lucide-react';

export function Welcome({ onGuest, onBartender, version }: { onGuest: () => void; onBartender: () => void; version: string }) {
  return <main className="welcome">
    <header className="welcome-header"><a href="/" className="brand"><Wine size={22} strokeWidth={1.5} /><span>CASA MICHELE</span></a><span className="eyebrow">THE HOME BAR</span></header>
    <div className="welcome-layout">
      <section className="welcome-copy">
        <p className="eyebrow text-amber-400">GOOD COMPANY. GREAT COCKTAILS.</p>
        <h1>A seat at<br />the bar.</h1>
        <p className="welcome-description">Find your favourite, try something new.<br />Your next cocktail starts here.</p>
        <button onClick={onGuest} className="welcome-primary"><span>Explore the menu</span><ArrowUpRight size={21} /></button>
        <p className="text-sm text-zinc-400 mt-4">Join with the event code from your host.</p>
        <button onClick={onBartender} className="welcome-staff"><Lock size={16} />Bartender access<ArrowUpRight size={16} className="ml-auto" /></button>
      </section>
      <figure className="welcome-photo">
        <img src="/images/cocktails/cocktail-negroni.webp" alt="Negroni served over ice with orange peel" fetchPriority="high" />
        <figcaption><span className="eyebrow">FROM THE MENU</span><span>Negroni</span><span className="text-sm text-zinc-400">Gin · Campari · Vermouth</span></figcaption>
      </figure>
    </div>
    <footer className="welcome-footer"><span>Casa Michele</span><span>{version}</span></footer>
  </main>;
}
