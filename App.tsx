import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Users,
  UserCircle,
  Wine,
  ClipboardList,
  Beer,
  Search,
  RefreshCw,
  Check,
  Trash2,
  X,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  BookOpen,
  LayoutGrid,
  List as ListIcon,
  Bell,
  Eye,
  EyeOff,
  Lock,
  Tag,
  QrCode,
  MessageCircle,
  Sparkles,
  ArrowLeft,
  Copy,
  ChevronDown,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Cocktail, Order, OrderStatus, IngredientAvailability, EventSession } from './types';
import { CasaApi, CasaApiError } from './services/casaApi';
import { fetchCocktailsFromSheet } from './services/sheet';
import bundledMenu from './data/menu.json';
import { useEventSync } from './hooks/useEventSync';
import { useConnectivity } from './hooks/useConnectivity';
import { Welcome } from './components/Welcome';
import { GuestEntry } from './components/GuestEntry';
import { SyncStatus } from './components/SyncStatus';
import { eventJoinUrl, eventCodeFromUrl, normalizeEventCode } from './services/links';
import { missingIngredients, filterRecipes, canGuestOrder } from './services/stock';
import { guestRequestKey, acknowledgeGuestRequest } from './services/guestRequests';
import { Button, BottomSheet, Toast, Badge, Toggle } from './components/UI';

// ── Helpers ────────────────────────────────────────
const timeAgo = (timestamp: number): string => {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const playOrderChime = () => {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) { /* Audio not available */ }
};

// ── Constants ──────────────────────────────────────
const VERSION = 'v5.1.0';
const SESSION_STORAGE_KEY = 'casa_michele_session_v1';

const INGREDIENT_CATEGORIES = ['Spirit', 'Liqueur', 'Juice', 'Syrup', 'Bitter', 'Other'];
const SPIRITS_LIST = ['Bourbon', 'Calvados', 'Cognac', 'Gin', 'Pisco', 'Rum', 'Tequila', 'Vodka', 'Other'];


const categorizeIngredient = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('bitter')) return 'Bitter';
  if (n.includes('juice')) return 'Juice';
  if (n.includes('syrup')) return 'Syrup';
  if (n.includes('ginger beer')) return 'Other';
  if (['bourbon', 'calvados', 'cognac', 'gin', 'pisco', 'rum', 'tequila', 'vodka'].some(s => n.includes(s))) return 'Spirit';
  if (['amaretto', 'aperol', 'apple schnapps', 'blue curacao', 'campari', 'cointreau', 'cacao', 'mente', 'violette', 'kahlua', 'lillet', 'maraschino', 'vermouth'].some(s => n.includes(s))) return 'Liqueur';
  return 'Other';
};

// ── App Component ──────────────────────────────────
const App: React.FC = () => {
  // Core state
  const [view, setView] = useState<'landing' | 'bartender' | 'guest'>('landing');
  const [session, setSession] = useState<EventSession | null>(null);
  const [savedBars, setSavedBars] = useState<EventSession[]>(() => {
    try { const bars = JSON.parse(localStorage.getItem('casa-saved-bars-v5') || '[]'); return Array.isArray(bars) ? bars.filter(bar => bar?.isBartender && typeof bar.eventCode === 'string') : []; } catch { return []; }
  });
  const [cocktails, setCocktails] = useState<Cocktail[]>(bundledMenu as Cocktail[]);
  const sync = useEventSync(session);
  const { orders, availability, connection: connectionState, savedAt: lastSyncAt } = sync;
  const connectivity = useConnectivity();
  const guestOrderKey = useRef<string | null>(null);
  const [walkInName, setWalkInName] = useState('Walk-in guest');
  const knownOrderIds = useRef(new Set<string>());
  const hasSynced = useRef(false);
  const pendingToggles = useRef(new Set<string>());

  // UI state
  const [activeTab, setActiveTab] = useState<'ingredients' | 'orders' | 'instructions'>('orders');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCocktail, setSelectedCocktail] = useState<Cocktail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isConfirmingOrder, setIsConfirmingOrder] = useState(false);
  const [lastOrderTime, setLastOrderTime] = useState(0);
  const [guestViewMode, setGuestViewMode] = useState<'grid' | 'list'>('grid');
  const [bartenderViewMode, setBartenderViewMode] = useState<'grid' | 'list'>('grid');
  const [isJoining, setIsJoining] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Filters
  const [filterUnavailableOnly, setFilterUnavailableOnly] = useState(false);
  const [guestShowUnavailable, setGuestShowUnavailable] = useState<boolean | null>(null);
  const [makeableOnly, setMakeableOnly] = useState(false);
  const [savingOrderPolicy, setSavingOrderPolicy] = useState(false);
  const allowOutOfStockOrders = sync.allowOutOfStockOrders === true;
  const showGuestUnavailable = guestShowUnavailable ?? allowOutOfStockOrders;
  const [activeCategories, setActiveCategories] = useState<string[]>(INGREDIENT_CATEGORIES);
  const [activeRecipeSpirits, setActiveRecipeSpirits] = useState<string[]>(SPIRITS_LIST);
  const [activeGuestSpirits, setActiveGuestSpirits] = useState<string[]>(SPIRITS_LIST);
  const [activeTasteProfiles, setActiveTasteProfiles] = useState<string[]>([]);

  // Notifications
  const [notifiedOrders, setNotifiedOrders] = useState<Set<string>>(new Set());
  const [pickupNotification, setPickupNotification] = useState<Order | null>(null);
  const [hasInitializedOrders, setHasInitializedOrders] = useState(false);

  // QR & Phone
  const [pendingSessionCode, setPendingSessionCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);

  // Timer for live updating timeAgo
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  // The bundled menu remains available even when a saved menu is damaged.
  useEffect(() => {
    try {
      const menu = JSON.parse(localStorage.getItem('casa-menu-v5') || 'null');
      if (Array.isArray(menu) && menu.length) setCocktails(menu);
    } catch { /* The bundled menu remains available if a cache is damaged. */ }
  }, []);

  useEffect(() => {
    let disposed = false;
    let receivedLink = false;
    const readSavedSession = (): EventSession | null => {
      try {
        const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null') as EventSession | null;
        return saved && (saved.isBartender || new Date(saved.expiresAt).getTime() > Date.now()) ? saved : null;
      } catch { return null; }
    };
    const acceptLink = (url: string) => {
      const code = eventCodeFromUrl(url);
      if (code && !disposed) {
        receivedLink = true;
        setPendingSessionCode(code);
        const saved = readSavedSession();
        const matching = saved?.eventCode === code ? saved : null;
        setSession(matching);
        setView(matching?.isBartender ? 'bartender' : 'guest');
        setSelectedCocktail(null);
        setShowQrCode(false);
      }
    };
    const native = Capacitor.isNativePlatform();
    const listener = native ? CapacitorApp.addListener('appUrlOpen', event => acceptLink(event.url)) : null;
    void (async () => {
      // Resolve an external launch before restoring the last workspace.
      // A newer appUrlOpen event always takes precedence over startup recovery.
      let launchUrl = window.location.href;
      if (native) {
        try { launchUrl = (await CapacitorApp.getLaunchUrl())?.url || launchUrl; }
        catch (error) { console.error('Could not read the app launch link', error); }
      }
      if (disposed || receivedLink) return;
      acceptLink(launchUrl);
      if (!receivedLink) {
        const saved = readSavedSession();
        setSession(saved);
        setView(saved ? (saved.isBartender ? 'bartender' : 'guest') : 'landing');
      }
    })();
    return () => { disposed = true; if (listener) void listener.then(handle => handle.remove()); };
  }, []);

  useEffect(() => {
    if (!session?.isBartender || !lastSyncAt) return;
    if (hasSynced.current) {
      const order = orders.find(item => item.status === 'pending' && !knownOrderIds.current.has(item.id));
      if (order) { playOrderChime(); showToast(`${order.guestName} ordered ${order.cocktailName}`, 'info'); }
    }
    knownOrderIds.current = new Set(orders.map(item => item.id));
    hasSynced.current = true;
  }, [lastSyncAt]);

  // Guest notification
  useEffect(() => {
    if (view !== 'guest' || !session || orders.length === 0) return;
    if (!hasInitializedOrders) {
      setNotifiedOrders(new Set(orders.filter(o => o.status === 'completed' && o.guestName === session.guestName).map(o => o.id)));
      setHasInitializedOrders(true);
      return;
    }
    const newReady = orders.find(o => o.status === 'completed' && o.guestName === session.guestName && !notifiedOrders.has(o.id));
    if (newReady) {
      setSelectedCocktail(null);
      setIsConfirmingOrder(false);
      setPickupNotification(newReady);
      setNotifiedOrders(prev => new Set(prev).add(newReady.id));
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  }, [orders, view, session, hasInitializedOrders, notifiedOrders]);

  // ── Actions ──────────────────────────────────────
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchCocktailsFromSheet();
      if (data.length > 0) {
        const menu = data.map(cocktail => ({ ...cocktail, imageUrl: (bundledMenu as Cocktail[]).find(item => item.id === cocktail.id)?.imageUrl || cocktail.imageUrl }));
        setCocktails(menu);
        localStorage.setItem('casa-menu-v5', JSON.stringify(menu));
        showToast('Menu updated');
      } else {
        showToast('No cocktails found', 'info');
      }
    } catch {
      showToast('Failed to load menu', 'error');
    }
    setIsRefreshing(false);
  };

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastType(type);
    setToastMessage(msg);
  }, []);

  const saveSession = (next: EventSession) => {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    if (next.isBartender) {
      const bars = [next, ...savedBars.filter(bar => bar.eventCode !== next.eventCode)];
      localStorage.setItem('casa-saved-bars-v5', JSON.stringify(bars));
      setSavedBars(bars);
    }
    setSession(next);
    setView(next.isBartender ? 'bartender' : 'guest');
    setNotifiedOrders(new Set());
    setHasInitializedOrders(false);
    hasSynced.current = false;
    knownOrderIds.current = new Set();
  };

  const handleJoin = async (
    role: 'bartender' | 'guest', code: string, guestName?: string,
    guestPhone?: string, pin?: string, guestEmail?: string,
  ) => {
    if (isJoining) return;
    setIsJoining(true);
    try {
      const eventCode = normalizeEventCode(code);
      const next = role === 'bartender'
        ? await CasaApi.startBartenderSession(eventCode, pin || '')
        : await CasaApi.startGuestSession(eventCode, guestName || '', guestPhone, guestEmail);
      saveSession(next);
    } catch (error) {
      if (role === 'guest') throw error;
      showToast((error as Error).message, 'error');
    } finally { setIsJoining(false); }
  };

  const startOfflineBar = () => {
    const code = 'BAR' + crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    saveSession({ eventCode: code, isBartender: true, token: '', expiresAt: '', offlineOnly: true });
  };

  const handleExit = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setView('landing');
    setHasInitializedOrders(false);
    setNotifiedOrders(new Set());
    setPendingSessionCode(null);
    setPickupNotification(null);
    setSelectedCocktail(null);
    setIsConfirmingOrder(false);
    guestOrderKey.current = null;
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('backButton', () => {
      if (isConfirmingOrder) {
        setIsConfirmingOrder(false);
      } else if (selectedCocktail) {
        setSelectedCocktail(null);
      } else if (showQrCode) {
        setShowQrCode(false);
      } else if (session) {
        handleExit();
      } else if (view !== 'landing') {
        setView('landing');
      } else {
        void CapacitorApp.exitApp();
      }
    });

    return () => {
      void listener.then(handle => handle.remove());
    };
  }, [isConfirmingOrder, selectedCocktail, showQrCode, session, view]);

  const toggleAvailability = async (ingredient: string) => {
    if (!session?.isBartender || pendingToggles.current.has(ingredient)) return;
    pendingToggles.current.add(ingredient);
    try {
      await sync.queue({ kind: 'stock', key: `stock:${ingredient}`, ingredient, isAvailable: !!availability[ingredient] });
    } catch { showToast('Could not save on this device. Free storage and try again.', 'error'); }
    finally { pendingToggles.current.delete(ingredient); }
  };

  const toggleGuestOrderPolicy = async () => {
    if (!session?.isBartender || savingOrderPolicy) return;
    setSavingOrderPolicy(true);
    try {
      await sync.queue({ kind: 'settings', key: 'settings:guestOrdering', allowOutOfStockOrders: !allowOutOfStockOrders });
      showToast(connectionState === 'online' ? 'Guest ordering setting saved. Syncing with the bar.' : 'Setting saved on this device. Guests will receive it after sync.', 'info');
    } catch { showToast('Could not save the guest ordering setting.', 'error'); }
    finally { setSavingOrderPolicy(false); }
  };

  const updateOrder = async (orderId: string, status: OrderStatus) => {
    if (!session?.isBartender) return;
    try {
      await sync.queue({ kind: 'status', key: `order:${orderId}`, orderId, status });
      showToast(connectionState === 'online' ? 'Saved. Syncing with the bar.' : 'Saved on this device. Will sync when connected.', 'info');
    } catch { showToast('Could not save the order change on this device.', 'error'); }
  };

  const addWalkInOrder = async () => {
    if (!session?.isBartender || !selectedCocktail || isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    try {
      const order: Order = { id: crypto.randomUUID(), eventCode: session.eventCode,
        guestName: walkInName.trim() || 'Walk-in guest', cocktailId: selectedCocktail.id,
        cocktailName: selectedCocktail.name, status: 'pending', timestamp: Date.now(), revision: 0 };
      await sync.queue({ kind: 'order', key: `order:${order.id}`, order });
      setSelectedCocktail(null);
      setActiveTab('orders');
      showToast('Walk-in order saved.');
    } catch { showToast('Could not save the walk-in order on this device.', 'error'); }
    finally { setIsSubmittingOrder(false); }
  };

  const openRecipeForOrder = (order: Order) => {
    const cocktail = cocktails.find(c => c.name === order.cocktailName) || cocktails.find(c => c.id === order.cocktailId);
    if (cocktail) setSelectedCocktail(cocktail);
    else showToast('Recipe not found', 'error');
  };

  const placeOrder = async () => {
    if (!session || !selectedCocktail || isSubmittingOrder) return;
    if (!connectivity.online || connectionState !== 'online') {
      showToast('You are offline. Reconnect to place an order.', 'error');
      return;
    }
    if (!canGuestOrder(selectedCocktail, availability, allowOutOfStockOrders)) {
      showToast('Sorry, an ingredient just ran out.', 'error');
      setIsConfirmingOrder(false);
      return;
    }
    if (Date.now() - lastOrderTime < 5000) {
      showToast('Please wait a moment', 'info');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      guestOrderKey.current = guestRequestKey(localStorage, session.token, selectedCocktail.id);
      await CasaApi.placeOrder(session.token, selectedCocktail, guestOrderKey.current);
      acknowledgeGuestRequest(localStorage, session.token, selectedCocktail.id, guestOrderKey.current);
      guestOrderKey.current = null;
      sync.retry();
      setLastOrderTime(Date.now());
      setIsConfirmingOrder(false);
      setSelectedCocktail(null);
      showToast('Order sent to the bar!');
    } catch (error) {
      showToast((error as Error).message || 'Could not place your order.', 'error');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const copyShoppingList = () => {
    const outOfStock = allIngredients.filter(i => availability[i]);
    if (outOfStock.length === 0) { showToast('Nothing out of stock'); return; }
    navigator.clipboard.writeText(outOfStock.map(i => `• ${i}`).join('\n')).then(() => showToast(`Copied ${outOfStock.length} items`)).catch(() => showToast('Clipboard unavailable. Select and copy the ingredient names instead.', 'info'));
  };

  // ── Derived Data ─────────────────────────────────
  const allIngredients = useMemo(() => {
    const set = new Set(cocktails.flatMap(c => c.ingredients).filter(i => i.length > 1));
    return Array.from(set).sort();
  }, [cocktails]);

  const allTasteProfiles = useMemo(() => {
    const set = new Set(cocktails.flatMap(c => c.tasteProfiles || []));
    return Array.from(set).sort();
  }, [cocktails]);

  const filteredIngredients = useMemo(() => {
    return allIngredients
      .filter(ing => ing.toLowerCase().includes(searchQuery.toLowerCase()))
      .filter(ing => {
        if (filterUnavailableOnly && !availability[ing]) return false;
        return activeCategories.includes(categorizeIngredient(ing));
      });
  }, [allIngredients, searchQuery, filterUnavailableOnly, activeCategories, availability]);

  const filteredGuestCocktails = useMemo(() => {
    return cocktails.filter(c => {
      if (!showGuestUnavailable && missingIngredients(c, availability).length > 0) return false;
      if (!c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      const spirits = c.ingredients.filter(ing => categorizeIngredient(ing) === 'Spirit');
      const spiritMatch = spirits.length === 0
        ? activeGuestSpirits.includes('Other')
        : spirits.some(ing => activeGuestSpirits.some(s => ing.toLowerCase().includes(s.toLowerCase())));
      if (!spiritMatch) return false;
      if (activeTasteProfiles.length > 0 && !(c.tasteProfiles || []).some(p => activeTasteProfiles.includes(p))) return false;
      return true;
    });
  }, [cocktails, searchQuery, activeGuestSpirits, availability, showGuestUnavailable, activeTasteProfiles]);

  const filteredRecipes = useMemo(() => filterRecipes(cocktails, availability, searchQuery, makeableOnly), [cocktails, availability, searchQuery, makeableOnly]);
  const makeableCount = useMemo(() => cocktails.filter(c => missingIngredients(c, availability).length === 0).length, [cocktails, availability]);

  const outOfStockCount = useMemo(() => Object.values(availability).filter(Boolean).length, [availability]);
  const pendingOrderCount = useMemo(() => orders.filter(o => o.status === 'pending').length, [orders]);
  const completedOrderCount = useMemo(() => orders.filter(o => o.status === 'completed').length, [orders]);

  // ════════════════════════════════════════════════
  // ██  LANDING PAGE  ██
  // ════════════════════════════════════════════════
  if (view === 'landing') {
    return <><Welcome onGuest={() => setView('guest')} onBartender={() => setView('bartender')} version={VERSION} />
      <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} /></>;
  }

  // ════════════════════════════════════════════════
  // ██  GUEST ENTRY FORM  ██
  // ════════════════════════════════════════════════
  if (view === 'guest' && !session) {
    return <GuestEntry code={pendingSessionCode} busy={isJoining} online={connectivity.online} checked={connectivity.checked}
      onBack={() => setView('landing')} onRetry={() => void connectivity.check()}
      onJoin={(code, name, phone, email) => handleJoin('guest', code, name, phone, undefined, email)} />;
  }

  if (view === 'bartender' && !session) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 flex flex-col relative">
        <button
          aria-label="Back to start" onClick={() => setView('landing')}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full py-8 animate-slideUp">
          <div className="space-y-2 mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">Bartender Access</h2>
            <p className="text-zinc-400 text-[15px]">Start a new event or resume one with the shared bartender password</p>
            <button onClick={startOfflineBar} className="w-full min-h-14 rounded-xl border border-amber-500/40 text-amber-300 p-4 mt-4">Start a local offline bar</button>
            <p className="text-xs text-zinc-400">Use the bundled menu now. Connect this bar to an online event later.</p>
            {savedBars.length > 0 && <div className="space-y-2 pt-4">
              <h3 className="text-sm font-semibold text-zinc-300">Saved bars on this device</h3>
              {savedBars.map(bar => <button key={bar.eventCode} onClick={() => saveSession(bar)} className="block w-full text-left min-h-12 p-3 rounded-xl bg-zinc-900 text-amber-300">Resume {bar.eventCode}</button>)}
            </div>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const pin = fd.get('password') as string;
              void handleJoin('bartender', fd.get('code') as string, undefined, undefined, pin);
            }}
            className="space-y-4"
          >
            <label className="block text-sm font-medium">Event code<input
              name="code"
              placeholder="Event code"
              required
              autoFocus
              minLength={4}
              maxLength={12}
              pattern="[A-Za-z0-9]+"
              autoCapitalize="characters"
              autoComplete="username"
              className="input-field mt-2 uppercase tracking-wider"
            /></label>
            <label className="block text-sm font-medium">Bartender password<div className="relative mt-2">
              <input
                name="password"
                type="password"
                placeholder="Bartender password"
                required
                maxLength={64}
                autoComplete="current-password"
                className="input-field pr-14"
              />
              <div className="absolute right-5 top-1/2 -translate-y-1/2 text-zinc-400">
                <Lock size={18} />
              </div>
            </div></label>
            <Button type="submit" disabled={isJoining} className="h-[56px] bg-amber-500 text-zinc-950 font-semibold text-[17px] rounded-xl mt-2">
              {isJoining ? 'Opening event...' : 'Open event'}
            </Button>
          </form>
        </div>

        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  GUEST MENU VIEW  ██
  // ════════════════════════════════════════════════
  if (view === 'guest' && session && (!connectivity.online || connectionState !== 'online')) {
    return <main className="min-h-screen bg-zinc-950 p-6 flex items-center justify-center">
      <div className="max-w-sm space-y-5 text-center">
        <h1 className="text-2xl font-bold">{!connectivity.checked || connectionState === 'connecting' ? 'Connecting to the bar...' : connectionState === 'expired' ? 'Join the event again' : 'Internet needed for guests'}</h1>
        <p className="text-zinc-400">{connectionState === 'expired' ? 'Your guest session has ended.' : 'Reconnect to see the live menu and send orders. The bartender can continue working offline.'}</p>
        <Button onClick={() => { void connectivity.check(); sync.retry(); }}>Try again</Button>
        <Button variant="secondary" onClick={handleExit}>Back to start</Button>
      </div>
    </main>;
  }

  if (view === 'guest' && session) {
    const myOrders = orders.filter(o => o.guestName === session.guestName);
    const lastOrder = myOrders.length > 0 ? [...myOrders].sort((a, b) => b.timestamp - a.timestamp)[0] : null;
    const isUnavailable = selectedCocktail ? !canGuestOrder(selectedCocktail, availability, allowOutOfStockOrders) : false;

    return (
      <div className="app-shell min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <header className="px-5 py-4 flex justify-between items-center border-b border-zinc-800/50 glass sticky top-0 z-30">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${connectionState === 'online' ? 'bg-emerald-500' : connectionState === 'offline' ? 'bg-red-500' : 'bg-amber-500'} ${connectionState !== 'offline' ? '' : ''}`} />
            <span className="text-xs font-medium text-zinc-300 tracking-wide">Event {session.eventCode}</span>
          </div>
          <button
            onClick={handleExit}
            className="px-3.5 py-1.5 bg-zinc-800/60 rounded-xl text-zinc-400 text-xs font-semibold hover:text-white transition-colors"
          >
            Exit
          </button>
        </header>

        {/* Last order banner */}
        {lastOrder && (
          <div className="px-4 pt-4 animate-slideUp">
            <div className="bg-amber-500/8 border border-amber-500/15 p-4 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-amber-300 text-xs font-semibold uppercase tracking-widest mb-1">Last order</p>
                <p className="text-white font-semibold text-sm">{lastOrder.cocktailName}</p>
              </div>
              <Badge variant={lastOrder.status === 'completed' ? 'success' : 'neutral'}>
                {lastOrder.status === 'completed' ? 'Ready' : lastOrder.status}
              </Badge>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="sticky top-[65px] z-20 bg-zinc-950/90 backdrop-blur-xl pt-5 pb-2 space-y-3">
          <div className="px-4 space-y-1">
            <p className="eyebrow text-amber-400">CASA MICHELE</p><h1 className="menu-title">The cocktail menu</h1>
            <p className="text-zinc-400 text-[13px]">
              {filteredGuestCocktails.length} cocktail{filteredGuestCocktails.length !== 1 ? 's' : ''} on the menu
            </p>
          </div>

          <div className="px-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="text"
                aria-label="Search cocktails" placeholder="Search cocktails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 focus:ring-2 focus:ring-amber-500/40 outline-none transition-all text-sm text-white placeholder:text-zinc-400"
              />
            </div>
            <button
              aria-label="Change menu layout" onClick={() => setGuestViewMode(guestViewMode === 'grid' ? 'list' : 'grid')}
              className="h-11 w-11 flex items-center justify-center bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 text-zinc-400 active:scale-95 transition-all"
            >
              {guestViewMode === 'grid' ? <ListIcon size={17} /> : <LayoutGrid size={17} />}
            </button>
          </div>

          {/* Spirit pills */}
          <div className="scroll-x py-1 px-4">
            <button
              aria-pressed={showGuestUnavailable} onClick={() => setGuestShowUnavailable(!showGuestUnavailable)}
              className={`pill ${showGuestUnavailable ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'pill-inactive'}`}
            >
              {showGuestUnavailable ? <Eye size={13} /> : <EyeOff size={13} />}
              {showGuestUnavailable ? 'Hide out of stock' : 'Show All'}
            </button>
            <div className="w-px h-5 bg-zinc-800 shrink-0 mx-0.5 self-center" />
            {SPIRITS_LIST.map(spirit => (
              <button
                key={spirit}
                aria-pressed={activeGuestSpirits.includes(spirit)} onClick={() => setActiveGuestSpirits(prev => prev.includes(spirit) ? prev.filter(s => s !== spirit) : [...prev, spirit])}
                className={`pill ${activeGuestSpirits.includes(spirit) ? 'pill-active' : 'pill-inactive'}`}
              >
                {spirit}
              </button>
            ))}
          </div>

          {allTasteProfiles.length > 0 && (
            <div className="scroll-x py-0.5 px-4 -mt-1">
              <Tag size={12} className="text-zinc-400 shrink-0 self-center" />
              {allTasteProfiles.map(profile => (
                <button
                  key={profile}
                  aria-pressed={activeTasteProfiles.includes(profile)} onClick={() => setActiveTasteProfiles(prev => prev.includes(profile) ? prev.filter(p => p !== profile) : [...prev, profile])}
                  className={`pill text-xs ${activeTasteProfiles.includes(profile) ? 'bg-zinc-100 text-zinc-950 border-zinc-100' : 'pill-inactive'}`}
                >
                  {profile}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cocktail Grid/List */}
        <main className={`flex-1 overflow-y-auto p-4 pb-20 ${guestViewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 auto-rows-max' : 'flex flex-col gap-2'}`}>
          {filteredGuestCocktails.length === 0 ? (
            <div className="col-span-full py-24 text-center space-y-3 animate-fadeIn">
              <Wine size={40} className="mx-auto text-zinc-700" />
              <p className="text-zinc-400 text-sm font-medium">No matching cocktails</p>
              {!showGuestUnavailable && (
                <button onClick={() => setGuestShowUnavailable(true)} className="text-amber-500 text-xs font-semibold underline underline-offset-2">
                  Show out-of-stock drinks
                </button>
              )}
            </div>
          ) : (
            filteredGuestCocktails.map((c, idx) => {
              const isOut = c.ingredients.some(i => availability[i]);

              if (guestViewMode === 'grid') {
                return (
                  <div
                    key={c.id}
                    role="button" tabIndex={0} aria-label={`View ${c.name}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCocktail(c); } }}
                  onClick={() => { guestOrderKey.current = null; setSelectedCocktail(c); }}
                    className={`group card-elevated overflow-hidden flex flex-col cursor-pointer ${isOut ? 'stock-unavailable' : ''}`}
                    style={{ borderRadius: 12 }}
                  >
                    <div className="aspect-square bg-zinc-800 relative overflow-hidden">
                      {c.imageUrl ? (
                        <img
                          src={c.imageUrl}
                          alt=""
                          className="w-full h-full object-cover object-[center_60%] "
                          loading="lazy"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            img.parentElement?.querySelector('.fallback-placeholder')?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`fallback-placeholder ${c.imageUrl ? 'hidden' : ''} absolute inset-0 bg-zinc-800 flex items-center justify-center`}>
                        <span className="text-3xl font-bold text-zinc-400">{c.name.charAt(0)}</span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/60 via-transparent to-transparent" />
                      {isOut && (
                        <div className="absolute top-2.5 right-2.5">
                          <Badge variant="error">Out of stock</Badge>
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-1.5 flex-1 flex flex-col justify-center">
                      <h3 className="text-[15px] font-semibold text-white leading-snug line-clamp-2">{c.name}</h3>
                      <p className="text-zinc-400 text-xs font-medium truncate">
                        {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House Mix'}
                      </p>
                      {c.tasteProfiles?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {c.tasteProfiles.slice(0, 2).map(p => (
                            <span key={p} className="text-[11px] font-medium text-zinc-400 bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={c.id}
                  role="button" tabIndex={0} aria-label={`View ${c.name}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCocktail(c); } }}
                  onClick={() => { guestOrderKey.current = null; setSelectedCocktail(c); }}
                  className={`flex items-center gap-3.5 p-3 card-flat cursor-pointer ${isOut ? 'stock-unavailable' : ''}`}
                >
                  <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden bg-zinc-800 relative flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-lg font-bold text-zinc-400">{c.name.charAt(0)}</span>
                    )}
                    {isOut && <div className="absolute inset-0 bg-black/60 flex items-center justify-center"><X size={12} className="text-red-400" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{c.name}</h3>
                    <p className="text-zinc-400 text-[11px] font-medium truncate">
                      {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House Mix'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-zinc-700 shrink-0" />
                </div>
              );
            })
          )}
        </main>

        {/* Toast */}
        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />

        <BottomSheet isOpen={!!pickupNotification} onClose={() => setPickupNotification(null)} title="Your drink is ready"
          footer={<Button onClick={() => setPickupNotification(null)}>On my way</Button>}>
          <div className="text-center py-8 space-y-4">
            <Bell size={32} strokeWidth={1.5} className="text-amber-400 mx-auto" />
            <p className="text-xl font-semibold">{pickupNotification?.cocktailName}</p>
            <p className="text-zinc-300">Collect your cocktail at the bar.</p>
          </div>
        </BottomSheet>

        {/* Cocktail detail */}
        <BottomSheet isOpen={!!selectedCocktail && !isConfirmingOrder} onClose={() => setSelectedCocktail(null)} title={selectedCocktail?.name || ''}
          footer={
            <Button
              onClick={() => setIsConfirmingOrder(true)}
              disabled={!!isUnavailable}
              className={isUnavailable ? 'bg-zinc-800 text-zinc-400' : 'bg-amber-500 text-zinc-950 h-[52px] font-semibold'}
            >
              {isUnavailable ? 'Currently Unavailable' : 'Order This Cocktail'}
            </Button>
          }
        >
          <div className="space-y-5 max-w-2xl mx-auto">
            {selectedCocktail && missingIngredients(selectedCocktail, availability).length > 0 && <p className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-200">{allowOutOfStockOrders ? 'The bartender is accepting orders for this drink despite missing stock.' : 'This drink is currently unavailable.'} Missing: {missingIngredients(selectedCocktail, availability).join(', ')}.</p>}
            <div className="aspect-[16/10] rounded-xl overflow-hidden bg-zinc-800 relative flex items-center justify-center">
              {selectedCocktail?.imageUrl ? (
                <img src={selectedCocktail.imageUrl} alt={selectedCocktail.name} className="w-full h-full object-cover object-[center_60%]" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <Wine size={48} className="text-zinc-700" />
              )}
              {selectedCocktail?.tasteProfiles?.length > 0 && (
                <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  {selectedCocktail.tasteProfiles.map(p => (
                    <span key={p} className="px-2.5 py-1 bg-black/50 backdrop-blur-md text-white text-xs font-semibold uppercase tracking-wider rounded-lg border border-white/10">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {selectedCocktail?.description && (
              <div className="space-y-1.5">
                <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">About</h4>
                <p className="text-zinc-300 text-sm leading-relaxed">{selectedCocktail.description}</p>
              </div>
            )}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Ingredients</h4>
              <div className="space-y-1.5">
                {selectedCocktail?.ingredients.filter(i => i.length > 1).map(ing => (
                  <div key={ing} className={`flex items-center gap-3 p-3 rounded-xl text-sm ${
                    availability[ing] ? 'bg-red-500/8 text-red-400 ring-1 ring-red-500/15' : 'bg-zinc-800/40 text-zinc-200'
                  }`}>
                    {availability[ing] ? <X size={14} className="shrink-0" /> : <Check size={14} className="text-emerald-500 shrink-0" />}
                    <span className="font-medium">{ing}</span>
                    {availability[ing] && <span className="ml-auto text-[11px] font-semibold uppercase text-red-300">Out</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </BottomSheet>

        {/* Confirm order */}
        <BottomSheet isOpen={isConfirmingOrder} onClose={() => setIsConfirmingOrder(false)} title="Confirm Order"
          footer={
            <div className="flex flex-col gap-2 max-w-sm mx-auto w-full">
              <Button onClick={placeOrder} disabled={isSubmittingOrder || connectionState === 'offline'} className="bg-amber-500 text-zinc-950 h-[52px] font-semibold">{isSubmittingOrder ? 'Sending...' : 'Confirm Order'}</Button>
              <Button onClick={() => setIsConfirmingOrder(false)} disabled={isSubmittingOrder} variant="ghost" className="text-zinc-400 h-10 text-sm">Cancel</Button>
            </div>
          }
        >
          <div className="py-6 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center mx-auto">
              <Beer size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-zinc-400 text-xs uppercase tracking-wider font-semibold">Ordering</p>
              <p className="text-xl font-bold text-white">{selectedCocktail?.name}</p>
            </div>
          </div>
        </BottomSheet>
      </div>
    );
  }

  // ════════════════════════════════════════════════
  // ██  BARTENDER DASHBOARD  ██
  // ════════════════════════════════════════════════
  if (view === 'bartender' && session) {
    return (
      <div className="app-shell min-h-screen bg-zinc-950 flex flex-col">
        {/* Header */}
        <header className="px-5 py-3.5 glass border-b border-zinc-800/40 flex justify-between items-center sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center text-zinc-950 ">
              <Wine size={17} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white tracking-tight leading-none">Casa Michele</h1>
              <p className={`text-xs font-medium mt-0.5 text-zinc-400`}>{session.eventCode} · Bar workspace</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <button aria-label="Share event QR code" onClick={() => setShowQrCode(true)} className="w-11 h-11 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <QrCode size={17} />
            </button>
            <button aria-label="Refresh menu" onClick={refreshData} className="w-11 h-11 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button aria-label="Leave event" onClick={handleExit} className="w-11 h-11 flex items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition-colors active:scale-95">
              <X size={17} />
            </button>
          </div>
        </header>
        <SyncStatus session={session} connection={connectionState} pending={sync.pending} savedAt={lastSyncAt}
          syncError={sync.error} onSession={saveSession} onResolve={sync.resolve} onRetry={sync.retry} />


        <BottomSheet isOpen={showQrCode} onClose={() => setShowQrCode(false)} title="Invite your guests"
          footer={<Button onClick={() => setShowQrCode(false)}>Done</Button>}>
          <div className="flex flex-col items-center gap-5 text-center py-4">
            <p className="text-sm text-zinc-300">{session.offlineOnly ? 'Connect this bar online before inviting guests.' : 'Scan on any phone to open this event.'}</p>
            <div className="p-4 bg-white rounded-lg"><QRCodeSVG title={`Join Casa Michele event ${session.eventCode}`} value={eventJoinUrl(session.eventCode)} size={200} level="H" includeMargin /></div>
            <div><p className="eyebrow text-zinc-400 mb-2">EVENT CODE</p><p className="text-2xl font-semibold tracking-[.15em] text-amber-300">{session.eventCode}</p></div>
            <a href={eventJoinUrl(session.eventCode)} target="_blank" rel="noopener noreferrer" className="text-sm text-amber-300 underline min-h-11">Open guest link</a>
          </div>
        </BottomSheet>

        {/* Content */}
        <main className="flex-1 overflow-y-auto pb-24">
          {/* ── STOCK TAB ── */}
          {activeTab === 'ingredients' && (
            <div>
              <section className="mx-4 mt-4 p-4 card-flat space-y-3" aria-label="Guest ordering settings">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-semibold text-white">Guest ordering</h2>
                    <p className="text-sm text-zinc-300">Allow out-of-stock drinks for guests to order</p>
                  </div>
                  <button type="button" aria-label="Allow out-of-stock drinks for guests to order" aria-pressed={allowOutOfStockOrders} disabled={savingOrderPolicy} onClick={toggleGuestOrderPolicy} className={`shrink-0 min-h-11 min-w-16 px-4 rounded-lg border font-semibold ${allowOutOfStockOrders ? 'bg-amber-500 text-zinc-950 border-amber-500' : 'bg-zinc-800 text-zinc-200 border-zinc-600'}`}>{allowOutOfStockOrders ? 'On' : 'Off'}</button>
                </div>
                <p className="text-xs text-zinc-400">{allowOutOfStockOrders ? 'Guests can order drinks with missing ingredients. Stock warnings stay visible.' : 'Guests can only order drinks with every ingredient in stock.'} Changes made offline apply to guests after sync.</p>
              </section>
              <div className="bg-zinc-950 p-4 space-y-3 border-b border-zinc-800/30">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                  <input
                    type="text"
                    aria-label="Search ingredients" placeholder="Search ingredients..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 bg-zinc-900/80 rounded-xl ring-1 ring-zinc-800/60 focus:ring-2 focus:ring-amber-500/40 outline-none transition-all text-sm text-white placeholder:text-zinc-400"
                  />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    aria-pressed={filterUnavailableOnly} onClick={() => setFilterUnavailableOnly(!filterUnavailableOnly)}
                    className={`pill ${filterUnavailableOnly ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'pill-inactive'}`}
                  >
                    Out Only{outOfStockCount > 0 ? ` (${outOfStockCount})` : ''}
                  </button>
                  {outOfStockCount > 0 && (
                    <button onClick={copyShoppingList} className="pill bg-zinc-800/60 text-zinc-300 border-zinc-700/50">
                      <Copy size={12} /> Shopping List
                    </button>
                  )}
                  {INGREDIENT_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      aria-pressed={activeCategories.includes(cat)} onClick={() => setActiveCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat])}
                      className={`pill ${activeCategories.includes(cat) ? 'pill-active' : 'pill-inactive'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {filteredIngredients.map((ing) => {
                  const isOut = !!availability[ing];
                  return (
                    <div
                      key={ing}
                      className={`flex items-center justify-between h-[56px] px-4 rounded-xl cursor-pointer transition-all duration-200 border select-none ${
                        isOut
                          ? 'bg-red-500/5 border-red-500/15 hover:bg-red-500/10'
                          : 'bg-zinc-900/60 border-zinc-800/50 hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-[13px] font-semibold ${isOut ? 'text-red-400' : 'text-zinc-200'}`}>{ing}</span>
                        <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{categorizeIngredient(ing)}</span>
                      </div>
                      <Toggle on={!isOut} onToggle={() => toggleAvailability(ing)} size="md" ariaLabel={`${ing} in stock`} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ORDERS TAB ── */}
          {activeTab === 'orders' && (
            <div className="p-4 space-y-4 max-w-4xl mx-auto w-full">
              {/* Stats bar */}
              <div className="flex justify-between items-center gap-3 px-1">
                <div>
                  <p className="eyebrow text-amber-400 mb-1">BAR SERVICE</p><h2 className="text-2xl font-semibold text-white tracking-tight">Orders</h2>
                  {orders.length > 0 && (
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full " />
                        {pendingOrderCount} pending
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        {completedOrderCount} done
                      </span>
                    </div>
                  )}
                </div>
                <button className="ml-auto text-sm font-medium text-amber-300 border border-zinc-700 rounded-lg px-3 min-h-11" onClick={() => setActiveTab('instructions')}>Add walk-in</button>
                <button
                  onClick={() => setBartenderViewMode(bartenderViewMode === 'grid' ? 'list' : 'grid')}
                  aria-label="Change order layout" className="w-11 h-11 flex items-center justify-center bg-zinc-800/60 rounded-xl text-zinc-400 active:scale-95 transition-transform"
                >
                  {bartenderViewMode === 'grid' ? <ListIcon size={16} /> : <LayoutGrid size={16} />}
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-24 text-center space-y-4 animate-fadeIn">
                  <div className="w-16 h-16 bg-zinc-900 rounded-xl flex items-center justify-center mx-auto text-zinc-700 border border-zinc-800/50">
                    <ClipboardList size={28} />
                  </div>
                  <div>
                    <p className="text-zinc-400 font-semibold text-base">No orders yet</p>
                    <p className="text-zinc-400 text-sm mt-1">{connectionState === 'online' ? 'Guest orders appear here. You can also add walk-ins.' : 'Add walk-in orders from the recipe menu.'}</p>
                    <button className="min-h-12 px-5 mt-5 rounded-xl bg-amber-500 text-zinc-950 font-semibold" onClick={() => setActiveTab('instructions')}>Add a walk-in order</button>
                  </div>
                </div>
              ) : (
                <div className={`grid ${bartenderViewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'} gap-3`}>
                  {[...orders].sort((a, b) => {
                      if (a.status === 'pending' && b.status !== 'pending') return -1;
                      if (a.status !== 'pending' && b.status === 'pending') return 1;
                      return (b.timestamp || 0) - (a.timestamp || 0);
                    })
                    .map(o => {
                      const minutesOld = o.timestamp ? Math.floor((Date.now() - o.timestamp) / 60000) : 0;
                      const isUrgent = o.status === 'pending' && minutesOld > 10;
                      const isWarning = o.status === 'pending' && minutesOld > 5 && !isUrgent;

                      return (
                        <div
                          key={o.id}
                          className={`card-elevated p-4 relative overflow-hidden transition-all duration-200 ${
                            isUrgent ? '!border-red-500/40 !border-l-4' : isWarning ? '!border-amber-500/40 !border-l-4' : ''
                          }`}
                          style={{ borderRadius: 12 }}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-base">{o.cocktailName}</h3>
                                {o.status === 'pending' && <span className="w-2 h-2 bg-amber-500 rounded-full " />}
                              </div>
                              <div className="flex items-center gap-2 text-zinc-400 text-[11px] font-medium">
                                <UserCircle size={12} />
                                <span>{o.guestName}</span>
                                {o.timestamp && (
                                  <span className={`${isUrgent ? 'text-red-400' : isWarning ? 'text-amber-400' : ''}`}>
                                    · {timeAgo(o.timestamp)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Badge variant={o.status === 'completed' ? 'success' : o.status === 'pending' ? 'warning' : 'neutral'}>
                              {o.status === 'completed' ? 'Done' : o.status}
                            </Badge>
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-2">
                            {o.status === 'pending' ? (
                              <>
                                <button
                                  onClick={() => { updateOrder(o.id, 'completed'); if (navigator.vibrate) navigator.vibrate(50); }}
                                  className="flex-1 h-[52px] bg-amber-500 text-zinc-950 rounded-xl font-bold text-sm tracking-wide hover:bg-amber-400 active:scale-[0.97] transition-all flex items-center justify-center gap-2 "
                                >
                                  <Check size={20} strokeWidth={3} /> Done
                                </button>
                                <button
                                  aria-label={`Recipe for ${o.cocktailName}`} onClick={() => openRecipeForOrder(o)}
                                  className="w-[52px] h-[52px] bg-zinc-800/60 text-zinc-400 rounded-xl flex items-center justify-center hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
                                >
                                  <BookOpen size={18} />
                                </button>
                              </>
                            ) : (
                              <>
                                {o.guestPhone && o.status === 'completed' && (
                                  <button
                                    aria-label={`WhatsApp ${o.guestName}`} onClick={() => {
                                      const text = `Hi ${o.guestName}, Your ${o.cocktailName} is ready at the bar!`;
                                      if (!connectivity.online) { showToast('Reconnect to open WhatsApp.', 'info'); return; }
                                      window.open(`https://wa.me/${o.guestPhone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="w-12 h-12 bg-amber-500 text-zinc-950 rounded-xl flex items-center justify-center active:scale-90 transition-all "
                                  >
                                    <MessageCircle size={20} fill="currentColor" />
                                  </button>
                                )}
                                {o.guestEmail && o.status === 'completed' && <a aria-label={`Email ${o.guestName}`} className="min-h-12 px-3 flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-100 text-sm" href={`mailto:${encodeURIComponent(o.guestEmail)}?subject=${encodeURIComponent('Your cocktail is ready')}&body=${encodeURIComponent(`Hi ${o.guestName}, your ${o.cocktailName} is ready at the bar.`)}`}>Email</a>}
                                {o.status === 'completed' && (
                                  <button
                                    onClick={() => updateOrder(o.id, 'pending')}
                                    className="flex-1 h-12 bg-zinc-800/50 text-zinc-400 rounded-xl font-semibold text-xs hover:bg-zinc-700 hover:text-white transition-all"
                                  >
                                    Undo
                                  </button>
                                )}
                                <button
                                  aria-label={`Remove ${o.cocktailName} for ${o.guestName}`} onClick={() => updateOrder(o.id, 'deleted')}
                                  className="w-12 h-12 bg-zinc-900 border border-zinc-800/50 text-zinc-400 rounded-xl flex items-center justify-center hover:text-red-400 hover:border-red-500/20 transition-all"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── INSTRUCTIONS TAB ── */}
          {activeTab === 'instructions' && (
            <div className="p-4 space-y-3 max-w-4xl mx-auto w-full">
              <h2 className="text-lg font-bold text-white tracking-tight px-1 mb-1">Recipes</h2>
              <label className="block text-sm text-zinc-300">Find a recipe<input className="input-field mt-2" type="search" placeholder="Cocktail name or ingredient" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} /></label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-zinc-400" role="status">{makeableCount} of {cocktails.length} ready to make</p>
                <button type="button" aria-pressed={makeableOnly} onClick={() => setMakeableOnly(value => !value)} className={`pill min-h-11 ${makeableOnly ? 'pill-active' : 'pill-inactive'}`}>Makeable only</button>
              </div>
              {filteredRecipes.length === 0 && <p className="py-10 text-center text-zinc-400">No recipes match. Try another search or turn off Makeable only.</p>}
              {filteredRecipes.map(c => {
                const missing = missingIngredients(c, availability);
                return (
                <div
                  key={c.id}
                  role="button" tabIndex={0} aria-label={`View ${c.name}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedCocktail(c); } }}
                  onClick={() => { guestOrderKey.current = null; setSelectedCocktail(c); }}
                  className={`flex items-center gap-3.5 p-3 card-flat cursor-pointer hover:bg-zinc-800/40 transition-colors ${missing.length ? 'stock-unavailable' : ''}`}
                >
                  <div className="w-11 h-11 bg-zinc-800 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <span className="text-sm font-bold text-zinc-400">{c.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm truncate">{c.name}</h3>
                    <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider truncate">
                      {c.ingredients.filter(i => categorizeIngredient(i) === 'Spirit').join(' · ') || 'House'}
                    </p>
                    <p className={`mt-1 text-xs leading-relaxed ${missing.length ? 'text-red-300' : 'text-emerald-400'}`}>{missing.length ? `Missing: ${missing.join(', ')}` : 'Ready to make'}</p>
                  </div>
                  <ChevronRight size={16} className="text-zinc-700 shrink-0" />
                </div>
              ); })}
            </div>
          )}
        </main>

        {/* Recipe Bottom Sheet */}
        <BottomSheet isOpen={!!selectedCocktail} onClose={() => setSelectedCocktail(null)} title={selectedCocktail?.name || ''}
          footer={<div className="space-y-3">
            <label className="block text-sm">Walk-in guest name<input value={walkInName} maxLength={60} onChange={event => setWalkInName(event.target.value)} className="input-field mt-2 h-12" /></label>
            <Button onClick={addWalkInOrder} disabled={isSubmittingOrder || !!selectedCocktail?.ingredients.some(item => availability[item])}>{isSubmittingOrder ? 'Saving...' : 'Add walk-in order'}</Button>
          </div>}>
          <div className="space-y-5 max-w-3xl mx-auto">
            {selectedCocktail?.imageUrl && <img src={selectedCocktail.imageUrl} alt={selectedCocktail.name} className="w-full max-h-56 object-cover object-[center_60%] rounded-lg" />}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Ingredients</h4>
              <div className="flex flex-wrap gap-1.5">
                {selectedCocktail?.ingredients.filter(i => i.length > 1).map(ing => (
                  <div key={ing} className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 ${
                    availability[ing] ? 'bg-red-500/8 ring-1 ring-red-500/15 text-red-400' : 'bg-zinc-800/50 text-zinc-200'
                  }`}>
                    {availability[ing] ? <X size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3} className="text-emerald-500" />}
                    {ing}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Instructions</h4>
              <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-800/40">
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{selectedCocktail?.instructions}</p>
              </div>
            </div>
          </div>
        </BottomSheet>

        <nav className="nav-bar safe-bottom" aria-label="Bar workspace">
          <div className="flex justify-around items-center h-[72px] px-4 max-w-lg mx-auto">
            {([
              { id: 'orders' as const, icon: ClipboardList, label: 'Orders' },
              { id: 'ingredients' as const, icon: Wine, label: 'Stock' },
              { id: 'instructions' as const, icon: BookOpen, label: 'Recipes' },
            ]).map(tab => <button key={tab.id} aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }} className="nav-item">
              <span className="relative"><tab.icon size={21} strokeWidth={1.75} />
                {tab.id === 'orders' && pendingOrderCount > 0 && <span className="nav-count">{pendingOrderCount}</span>}
              </span><span className="nav-item-label">{tab.label}</span>
            </button>)}
          </div>
        </nav>

        <Toast isVisible={!!toastMessage} message={toastMessage} onHide={() => setToastMessage('')} type={toastType} />
      </div>
    );
  }

  return null;
};

export default App;
