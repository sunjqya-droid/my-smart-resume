
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Droplets, Pause, Play, RefreshCw, Volume2, ShieldCheck, Moon, CheckCircle2, Trash2, Wifi, WifiOff, Loader2 } from 'lucide-react';
import { AppState } from './types';
import { getTodayStr, isWithinReminderPeriod, getNextReminderTime, formatTime, formatCountdown, START_HOUR, END_HOUR } from './utils/time';
import WaterGlass from './components/WaterGlass';

const STORAGE_KEY = 'aquaflow_state_v4';
const USER_KEY = 'default_user'; 

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const today = getTodayStr();
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed.lastDate === today) return parsed;
      } catch (e) { console.error(e); }
    }
    return { count: 0, isActive: false, lastReminderHour: null, lastDate: today };
  });

  // 数据库连接状态：'loading' | 'connected' | 'error' | 'local'
  const [dbStatus, setDbStatus] = useState<'loading' | 'connected' | 'error' | 'local'>('loading');
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isReminderPeriod, setIsReminderPeriod] = useState(isWithinReminderPeriod());
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastTriggeredHourRef = useRef<number | null>(state.lastReminderHour);

  // --- 数据库同步与测试逻辑 ---
  const fetchDbState = useCallback(async () => {
    setDbStatus('loading');
    try {
      const today = getTodayStr();
      const res = await fetch(`/.netlify/functions/sync?userKey=${USER_KEY}&date=${today}`);
      
      if (!res.ok) throw new Error('Network response was not ok');
      
      const dbData = await res.json();
      if (dbData) {
        setState(prev => ({ ...prev, ...dbData, lastDate: today }));
      }
      setDbStatus('connected');
    } catch (e) {
      console.warn("Neon DB 连接失败:", e);
      setDbStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncToDb = useCallback(async (data: AppState) => {
    try {
      const res = await fetch('/.netlify/functions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userKey: USER_KEY,
          date: data.lastDate,
          count: data.count,
          isActive: data.isActive,
          lastReminderHour: data.lastReminderHour
        }),
      });
      if (res.ok) setDbStatus('connected');
      else setDbStatus('error');
    } catch (e) {
      setDbStatus('error');
      console.error("数据同步失败", e);
    }
  }, []);

  // 初始加载测试
  useEffect(() => {
    fetchDbState();
  }, [fetchDbState]);

  // 状态变动自动同步
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    lastTriggeredHourRef.current = state.lastReminderHour;
    if (!isLoading) {
      const timer = setTimeout(() => syncToDb(state), 1000); 
      return () => clearTimeout(timer);
    }
  }, [state, isLoading, syncToDb]);

  // --- 业务逻辑 ---
  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  };

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); 
      osc.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.1); 
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {}
  }, []);

  const triggerReminder = useCallback((hour: number) => {
    lastTriggeredHourRef.current = hour;
    playNotificationSound();
    if (notificationPermission === 'granted') {
      new Notification("该喝水啦！💧", { body: `现在是 ${hour}:00。休息一下，补充点水分吧。` });
    }
    setShowCheckInModal(true);
    setState(prev => ({ ...prev, lastReminderHour: hour }));
  }, [notificationPermission, playNotificationSound]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setIsReminderPeriod(isWithinReminderPeriod());
      const today = getTodayStr();
      if (state.lastDate !== today) {
        setState({ count: 0, isActive: state.isActive, lastReminderHour: null, lastDate: today });
      }
      const currentHour = now.getHours();
      if (state.isActive && isWithinReminderPeriod() && now.getMinutes() === 0 && lastTriggeredHourRef.current !== currentHour) {
        triggerReminder(currentHour);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.isActive, state.lastDate, triggerReminder]);

  const toggleApp = () => {
    if (!state.isActive && notificationPermission === 'default') requestPermission();
    setState(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const addGlass = () => setState(prev => ({ ...prev, count: Math.min(prev.count + 1, 24) }));
  const resetCount = () => { if (window.confirm("确定要重置吗？")) setState(prev => ({ ...prev, count: 0 })); };

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-blue-50">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
      <div className="text-blue-600 font-black text-xl animate-pulse">正在测试 Neon 数据库连接...</div>
    </div>
  );

  const nextReminder = getNextReminderTime();
  const countdownMs = nextReminder ? nextReminder.getTime() - currentTime.getTime() : 0;
  const glasses = Array.from({ length: 8 }, (_, i) => i < state.count);

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-12 min-h-screen animate-in fade-in duration-700">
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md border border-white/60 space-y-8 overflow-hidden transition-all duration-500 hover:shadow-blue-200/50">
        
        <div className="flex justify-between items-center relative">
          <div className="flex items-center space-x-2 text-blue-600">
            <Droplets className="w-8 h-8 animate-bounce" />
            <h1 className="text-3xl font-extrabold tracking-tight">水叮当</h1>
          </div>
          <div 
            className={`flex items-center space-x-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors \${
              dbStatus === 'connected' ? 'bg-green-100 text-green-600' : 
              dbStatus === 'error' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-600'
            }`}
          >
            {dbStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>{dbStatus === 'connected' ? 'Neon 在线' : dbStatus === 'error' ? '连接失败' : '正在同步'}</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-white rounded-3xl p-6 text-center border border-blue-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
          <div className="text-5xl font-mono font-bold text-gray-800 tracking-wider">{formatTime(currentTime)}</div>
          <p className="text-[10px] text-blue-400 mt-2 font-black uppercase tracking-[0.2em]">今日数据自动备份至云端</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-blue-50 shadow-sm flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider">下次提醒</span>
            <div className="text-xl font-black text-gray-700">
              {state.isActive && isReminderPeriod ? formatCountdown(countdownMs) : '--:--:--'}
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-blue-50 shadow-sm flex flex-col items-center justify-center">
            <span className="text-[10px] text-gray-400 font-bold mb-1 uppercase tracking-wider">运行状态</span>
            <div className={`flex items-center space-x-1 font-bold \${!state.isActive ? 'text-gray-400' : isReminderPeriod ? 'text-green-500' : 'text-orange-400'}`}>
              {!state.isActive ? <Pause size={14} fill="currentColor" /> : isReminderPeriod ? <Play size={14} fill="currentColor" /> : <Moon size={14} fill="currentColor" />}
              <span>{!state.isActive ? '已暂停' : isReminderPeriod ? '提醒中' : '休息中'}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between items-end px-1">
            <div>
              <h2 className="text-lg font-bold text-gray-700">今日进度</h2>
              <p className="text-xs text-gray-400">目标：每天 8 杯水</p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-black shadow-md shadow-blue-200">{state.count} 杯</span>
              <button 
                onClick={fetchDbState} 
                className="p-2 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-full transition-all active:scale-90"
                title="手动刷新"
              >
                <RefreshCw size={14} className={dbStatus === 'loading' ? 'animate-spin' : ''} />
              </button>
              <button onClick={resetCount} className="p-2 bg-red-500 text-white hover:bg-red-600 active:bg-red-800 rounded-full transition-all active:scale-90 shadow-md"><Trash2 size={14} /></button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3 bg-blue-50/40 p-5 rounded-[2.5rem] border border-blue-100/50">
            {glasses.map((filled, i) => <div key={i} className="flex justify-center"><WaterGlass filled={filled} /></div>)}
            <button onClick={addGlass} className="w-12 h-16 border-4 border-dashed border-blue-400 bg-blue-500/10 rounded-b-xl flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white active:bg-blue-800 transition-all transform active:scale-95 shadow-sm"><span className="text-2xl font-bold">+</span></button>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <button onClick={toggleApp} className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center space-x-2 transition-all shadow-xl active:scale-[0.96] \${state.isActive ? 'bg-slate-500 text-white hover:bg-slate-600 active:bg-slate-800 shadow-slate-100' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-900 shadow-blue-300'}`}>
            {state.isActive ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            <span>{state.isActive ? '停止提醒' : '开启提醒'}</span>
          </button>
          {notificationPermission !== 'granted' && (
            <button onClick={requestPermission} className="w-full py-4 bg-cyan-600 text-white rounded-3xl text-sm font-bold hover:bg-cyan-700 active:bg-cyan-900 transition-all flex items-center justify-center space-x-2 shadow-lg shadow-cyan-100"><ShieldCheck size={18} /><span>授予通知权限</span></button>
          )}
        </div>

        {dbStatus === 'error' && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-2xl text-[10px] text-red-500 font-bold text-center">
            数据库连接异常。请检查 Netlify 是否已配置 DATABASE_URL。
          </div>
        )}
      </div>

      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-blue-900/30 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full shadow-2xl border border-white text-center space-y-6 transform animate-in zoom-in-95 duration-300">
            <Droplets className="w-12 h-12 text-blue-600 animate-pulse mx-auto" />
            <h3 className="text-3xl font-black text-gray-800">该喝水啦！</h3>
            <div className="flex flex-col space-y-3">
              <button onClick={() => { addGlass(); setShowCheckInModal(false); }} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] text-xl font-black shadow-xl hover:bg-blue-700 active:bg-blue-900 transition-all">已喝一杯水</button>
              <button onClick={() => setShowCheckInModal(false)} className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 active:bg-gray-300 transition-all">稍后再说</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
