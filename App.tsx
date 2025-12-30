
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Droplets, Pause, Play, RefreshCw, Volume2, ShieldCheck, Moon, CheckCircle2, Trash2 } from 'lucide-react';
import { AppState } from './types';
import { getTodayStr, isWithinReminderPeriod, getNextReminderTime, formatTime, formatCountdown, START_HOUR, END_HOUR } from './utils/time';
import WaterGlass from './components/WaterGlass';

const STORAGE_KEY = 'aquaflow_state_v3';

const App: React.FC = () => {
  // --- 状态管理 ---
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const today = getTodayStr();
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppState;
        if (parsed.lastDate === today) return parsed;
      } catch (e) {
        console.error("解析存储失败", e);
      }
    }
    return {
      count: 0,
      isActive: false,
      lastReminderHour: null,
      lastDate: today
    };
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isReminderPeriod, setIsReminderPeriod] = useState(isWithinReminderPeriod());
  const [showCheckInModal, setShowCheckInModal] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const lastTriggeredHourRef = useRef<number | null>(state.lastReminderHour);

  // --- 数据持久化 ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    lastTriggeredHourRef.current = state.lastReminderHour;
  }, [state]);

  // --- 通知与音频逻辑 ---
  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    } else {
      alert("您的浏览器不支持系统通知。");
    }
  };

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'suspended') {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
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
    } catch (e) {
      console.warn("音频播放受限", e);
    }
  }, []);

  const triggerReminder = useCallback((hour: number) => {
    lastTriggeredHourRef.current = hour;
    playNotificationSound();
    
    if (notificationPermission === 'granted') {
      new Notification("该喝水啦！💧", {
        body: `现在是 ${hour}:00。休息一下，补充点水分吧。`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3105/3105807.png'
      });
    }

    setShowCheckInModal(true);
    setState(prev => ({
      ...prev,
      lastReminderHour: hour
    }));
  }, [notificationPermission, playNotificationSound]);

  // --- 定时器逻辑 ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      const inPeriod = isWithinReminderPeriod();
      setIsReminderPeriod(inPeriod);

      const today = getTodayStr();
      if (state.lastDate !== today) {
        lastTriggeredHourRef.current = null;
        setState(prev => ({
          ...prev,
          count: 0,
          lastDate: today,
          lastReminderHour: null
        }));
      }

      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (
        state.isActive && 
        inPeriod && 
        currentMinute === 0 && 
        lastTriggeredHourRef.current !== currentHour
      ) {
        triggerReminder(currentHour);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.isActive, state.lastDate, triggerReminder]);

  const toggleApp = () => {
    if (!state.isActive && notificationPermission === 'default') {
      requestPermission();
    }
    
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    setState(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const addGlass = () => {
    setState(prev => ({ ...prev, count: Math.min(prev.count + 1, 24) }));
  };

  const resetCount = () => {
    if (window.confirm("确定要重置今日的饮水统计吗？")) {
      setState(prev => ({ ...prev, count: 0 }));
    }
  };

  const handleCheckIn = () => {
    addGlass();
    setShowCheckInModal(false);
  };

  const nextReminder = getNextReminderTime();
  const countdownMs = nextReminder ? nextReminder.getTime() - currentTime.getTime() : 0;
  const glasses = Array.from({ length: 8 }, (_, i) => i < state.count);

  return (
    <div className="flex flex-col items-center justify-center p-4 sm:p-12 min-h-screen animate-in fade-in duration-700">
      
      <div className="relative bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-8 w-full max-w-md border border-white/60 space-y-8 overflow-hidden transition-all duration-500 hover:shadow-blue-200/50">
        
        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-blue-100 rounded-full blur-2xl opacity-60 pointer-events-none"></div>

        <div className="text-center space-y-2 relative">
          <div className="flex items-center justify-center space-x-2 text-blue-600">
            <Droplets className="w-8 h-8 animate-bounce" />
            <h1 className="text-3xl font-extrabold tracking-tight">水叮当</h1>
          </div>
          <p className="text-gray-500 text-sm font-medium">健康生活，从这杯水开始</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-white rounded-3xl p-6 text-center border border-blue-100 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]">
          <div className="text-5xl font-mono font-bold text-gray-800 tracking-wider">
            {formatTime(currentTime)}
          </div>
          <p className="text-xs text-blue-400 mt-2 font-bold uppercase tracking-[0.2em]">
            当前北京时间
          </p>
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
              {!state.isActive ? (
                <><Pause size={14} fill="currentColor" /><span>已暂停</span></>
              ) : isReminderPeriod ? (
                <><Play size={14} fill="currentColor" /><span>提醒中</span></>
              ) : (
                <><Moon size={14} fill="currentColor" /><span>休息中</span></>
              )}
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
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-black shadow-md shadow-blue-200">
                {state.count} 杯
              </span>
              <button 
                onClick={resetCount}
                className="p-2 bg-red-500 text-white hover:bg-red-600 active:bg-red-700 rounded-full transition-all active:scale-90 shadow-md shadow-red-100"
                title="重置今日数据"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-3 bg-blue-50/40 p-5 rounded-[2.5rem] border border-blue-100/50">
            {glasses.map((filled, i) => (
              <div key={i} className="flex justify-center">
                <WaterGlass filled={filled} />
              </div>
            ))}
            <button 
              onClick={addGlass}
              className="w-12 h-16 border-4 border-dashed border-blue-400 bg-blue-500/10 rounded-b-xl flex items-center justify-center text-blue-600 hover:bg-blue-600 hover:text-white active:bg-blue-800 transition-all transform active:scale-95 shadow-sm"
            >
              <span className="text-2xl font-bold">+</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <button
            onClick={toggleApp}
            className={`w-full py-5 rounded-3xl font-black text-lg flex items-center justify-center space-x-2 transition-all shadow-xl active:scale-[0.96] \${state.isActive ? 'bg-slate-500 text-white hover:bg-slate-600 active:bg-slate-800 shadow-slate-100' : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-900 shadow-blue-300'}`}
          >
            {state.isActive ? (
              <><Pause fill="currentColor" /><span>停止提醒</span></>
            ) : (
              <><Play fill="currentColor" /><span>开启提醒</span></>
            )}
          </button>

          {notificationPermission !== 'granted' && (
            <button
              onClick={requestPermission}
              className="w-full py-4 bg-cyan-600 text-white rounded-3xl text-sm font-bold hover:bg-cyan-700 active:bg-cyan-900 transition-all flex items-center justify-center space-x-2 active:scale-[0.98] shadow-lg shadow-cyan-100"
            >
              <ShieldCheck size={18} />
              <span>授予浏览器通知权限</span>
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-gray-100 flex justify-center text-[10px] text-gray-300 uppercase tracking-[0.2em] font-black">
          提醒时段：{START_HOUR}:00 — {END_HOUR}:00
        </div>
      </div>

      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-blue-900/30 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] p-10 max-w-sm w-full shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-white text-center space-y-6 transform animate-in zoom-in-95 duration-300">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Droplets className="w-12 h-12 text-blue-600 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-black text-gray-800">该喝水啦！</h3>
              <p className="text-gray-500 font-medium">身体正在呼唤水分，现在就喝一杯吧？</p>
            </div>
            <div className="flex flex-col space-y-3">
              <button
                onClick={handleCheckIn}
                className="w-full py-5 bg-blue-600 text-white rounded-[2rem] text-xl font-black shadow-xl shadow-blue-200 hover:bg-blue-700 active:bg-blue-900 active:scale-95 transition-all"
              >
                已喝一杯水
              </button>
              <button
                onClick={() => setShowCheckInModal(false)}
                className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 hover:text-gray-700 active:bg-gray-300 transition-all active:scale-95"
              >
                稍后再说
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-20 left-10 w-32 h-32 bg-blue-200/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
      <div className="fixed bottom-20 right-10 w-48 h-48 bg-blue-400/10 rounded-full blur-3xl -z-10 animate-pulse" style={{ animationDelay: '1s' }}></div>
    </div>
  );
};

export default App;
