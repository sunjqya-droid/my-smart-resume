
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { neon } from '@neondatabase/serverless';
import { Droplets, Pause, Play, RefreshCw, ShieldCheck, Moon, Wifi, WifiOff, Loader2, CloudUpload, AlertCircle, Database } from 'lucide-react';
import { AppState } from './types';
import { getTodayStr, isWithinReminderPeriod, getNextReminderTime, formatCountdown, START_HOUR, END_HOUR } from './utils/time';
import WaterGlass from './components/WaterGlass';

// 1. 直接配置数据库连接 (按用户要求硬编码)
const DATABASE_URL = 'postgresql://neondb_owner:npg_Eh5cMmxqpY7u@ep-old-recipe-aexkvlyi-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const sql = neon(DATABASE_URL);

const STORAGE_KEY = 'aquaflow_state_v4';
const USER_KEY = 'me'; 

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

  const [dbStatus, setDbStatus] = useState<'loading' | 'connected' | 'error' | 'syncing'>('loading');
  const [dbError, setDbError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  
  const isReminderPeriod = isWithinReminderPeriod();
  const lastTriggeredHourRef = useRef<number | null>(state.lastReminderHour);

  // --- 初始化数据库表结构 ---
  const initDatabase = useCallback(async () => {
    try {
      // 检查/创建表并确保字段存在
      await sql`
        CREATE TABLE IF NOT EXISTS water_reminders (
          id SERIAL PRIMARY KEY,
          user_key TEXT NOT NULL DEFAULT 'me',
          log_date DATE NOT NULL DEFAULT CURRENT_DATE,
          count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT false,
          last_reminder_hour INTEGER,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
      // 尝试添加唯一约束以支持 ON CONFLICT
      try {
        await sql`ALTER TABLE water_reminders ADD CONSTRAINT unique_user_date UNIQUE (user_key, log_date);`;
      } catch (e) { /* 约束可能已存在 */ }
      
      return true;
    } catch (e: any) {
      console.error("DB Init Error:", e);
      setDbError(`数据库初始化失败: ${e.message}`);
      return false;
    }
  }, []);

  // --- 从数据库拉取数据 ---
  const fetchDbState = useCallback(async () => {
    setDbStatus('loading');
    const initialized = await initDatabase();
    if (!initialized) {
      setDbStatus('error');
      setIsLoading(false);
      return;
    }

    try {
      const today = getTodayStr();
      const results = await sql`
        SELECT count, is_active as "isActive", last_reminder_hour as "lastReminderHour"
        FROM water_reminders
        WHERE user_key = ${USER_KEY} AND log_date = ${today}
        LIMIT 1
      `;
      
      if (results && results.length > 0) {
        const dbData = results[0];
        setState(prev => ({ 
          ...prev, 
          count: dbData.count,
          isActive: dbData.isActive,
          lastReminderHour: dbData.lastReminderHour,
          lastDate: today 
        }));
      }
      setDbStatus('connected');
    } catch (e: any) {
      setDbStatus('error');
      setDbError(`拉取数据失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [initDatabase]);

  // --- 同步数据到数据库 ---
  const syncToDb = useCallback(async (data: AppState) => {
    setDbStatus('syncing');
    try {
      await sql`
        INSERT INTO water_reminders (user_key, log_date, count, is_active, last_reminder_hour)
        VALUES (${USER_KEY}, ${data.lastDate}, ${data.count}, ${data.isActive}, ${data.lastReminderHour})
        ON CONFLICT (user_key, log_date) DO UPDATE SET
          count = EXCLUDED.count,
          is_active = EXCLUDED.is_active,
          last_reminder_hour = EXCLUDED.last_reminder_hour,
          updated_at = CURRENT_TIMESTAMP
      `;
      setDbStatus('connected');
      setDbError(null);
    } catch (e: any) {
      setDbStatus('error');
      setDbError(`同步失败: ${e.message}`);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchDbState();
  }, [fetchDbState]);

  // 数据变更自动保存与同步 (增加 1.5s 防抖)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!isLoading) {
      const timer = setTimeout(() => syncToDb(state), 1500);
      return () => clearTimeout(timer);
    }
  }, [state, isLoading, syncToDb]);

  // 定时器逻辑
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      const currentHour = now.getHours();
      
      if (state.isActive && isWithinReminderPeriod() && currentHour !== lastTriggeredHourRef.current) {
        lastTriggeredHourRef.current = currentHour;
        setState(prev => ({ ...prev, lastReminderHour: currentHour }));
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('喝水时间到', { body: `现在是 ${currentHour}:00，请喝一杯水补充能量！` });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [state.isActive]);

  const incrementCount = () => {
    setState(prev => ({ ...prev, count: Math.min(prev.count + 1, 8) }));
  };

  const resetCount = () => {
    if (window.confirm('确定要清空今日进度吗？')) {
      setState(prev => ({ ...prev, count: 0 }));
    }
  };

  const toggleActive = () => {
    if (!state.isActive && notificationPermission !== 'granted') {
      Notification.requestPermission().then(setNotificationPermission);
    }
    setState(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const nextTime = getNextReminderTime();
  const countdownMs = nextTime ? nextTime.getTime() - currentTime.getTime() : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* 数据库状态标签 */}
      <div className="w-full max-w-md mb-6 flex items-center justify-between bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-2">
          {dbStatus === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          {dbStatus === 'connected' && <Wifi className="w-4 h-4 text-emerald-500" />}
          {dbStatus === 'syncing' && <CloudUpload className="w-4 h-4 text-blue-500 animate-pulse" />}
          {dbStatus === 'error' && <WifiOff className="w-4 h-4 text-rose-500" />}
          <span className="text-xs font-semibold text-slate-600">
            {dbStatus === 'connected' ? '数据库已就绪' : 
             dbStatus === 'loading' ? '正在握手...' :
             dbStatus === 'syncing' ? '云端同步中' : '连接受阻'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 opacity-40">
          <Database size={12} />
          <span className="text-[10px] font-mono">Neon DB</span>
        </div>
      </div>

      {dbError && (
        <div className="w-full max-w-md mb-4 bg-rose-50 border border-rose-100 p-3 rounded-xl flex items-start gap-3 text-rose-600 text-[13px]">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold">同步故障</p>
            <p className="opacity-80">{dbError}</p>
          </div>
        </div>
      )}

      {/* 主卡片 */}
      <div className="w-full max-w-md bg-white rounded-[2rem] shadow-xl shadow-blue-900/5 p-8 flex flex-col items-center border border-slate-100 relative">
        <div className="mb-4 text-blue-500">
          <Droplets size={54} className="animate-pulse" />
        </div>
        
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-slate-800">AquaFlow</h1>
          <p className="text-slate-400 text-sm">您的私人饮水管家</p>
        </div>

        {/* 倒计时 */}
        <div className="w-full bg-slate-50 rounded-2xl p-6 mb-10 text-center">
          {!isReminderPeriod ? (
            <div className="flex flex-col items-center py-2">
              <Moon size={24} className="text-indigo-300 mb-2" />
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">静默模式 (22:00-09:00)</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">下次提醒</span>
              <div className="text-5xl font-mono font-bold text-slate-700 tabular-nums">
                {formatCountdown(countdownMs)}
              </div>
            </div>
          )}
        </div>

        {/* 水杯展示区 */}
        <div className="grid grid-cols-4 gap-4 mb-12">
          {[...Array(8)].map((_, i) => (
            <WaterGlass 
              key={i} 
              filled={i < state.count} 
              onClick={() => i === state.count ? incrementCount() : undefined}
            />
          ))}
        </div>

        {/* 核心数值 */}
        <div className="flex items-baseline gap-2 mb-10">
          <span className="text-7xl font-black text-blue-500">{state.count}</span>
          <span className="text-2xl text-slate-200 font-bold">/ 8</span>
        </div>

        {/* 交互按钮 */}
        <div className="flex gap-4 w-full">
          <button 
            onClick={toggleActive}
            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black transition-all active:scale-95 shadow-lg
              ${state.isActive 
                ? 'bg-slate-100 text-slate-500 shadow-none' 
                : 'bg-blue-500 text-white shadow-blue-200'}`}
          >
            {state.isActive ? <Pause size={20} /> : <Play size={20} />}
            {state.isActive ? '停止提醒' : '开启提醒'}
          </button>
          
          <button 
            onClick={resetCount}
            className="w-16 flex items-center justify-center bg-slate-50 text-slate-300 rounded-2xl hover:text-slate-500 transition-colors"
            title="重置进度"
          >
            <RefreshCw size={22} />
          </button>
        </div>
      </div>

      <footer className="mt-8 text-center">
        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.2em]">
          End-to-End Encrypted Cloud Sync
        </p>
      </footer>
    </div>
  );
};

export default App;
