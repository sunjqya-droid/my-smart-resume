
import React from 'react';

interface WaterGlassProps {
  filled: boolean;
  onClick?: () => void;
}

const WaterGlass: React.FC<WaterGlassProps> = ({ filled, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={`relative w-12 h-16 border-4 rounded-b-xl cursor-pointer transition-all duration-300 transform hover:scale-110 
        \${filled ? 'border-blue-400 bg-blue-100' : 'border-gray-200 bg-white'}`}
    >
      {filled && (
        <div className="absolute bottom-0 left-0 right-0 bg-blue-400 animate-pulse" style={{ height: '80%' }}>
           <div className="absolute -top-1 left-0 right-0 h-2 bg-blue-300 rounded-full opacity-50"></div>
        </div>
      )}
      <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-bold text-blue-500 opacity-20">
        H2O
      </div>
    </div>
  );
};

export default WaterGlass;
