import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import CalendarHeatmap from 'react-calendar-heatmap';

// Base styles for the library (usually imported from the node_module)
// But we'll rely on index.css for theme consistency
import 'react-calendar-heatmap/dist/styles.css';

interface HeatmapData {
  [date: string]: number;
}

export default function ReviewHeatmap() {
  const { user } = useAuth();
  const [data, setData] = useState<HeatmapData>({});
  
  const fetchStats = async () => {
    if (!user) return;
    try {
      const { data: stats, error } = await supabase.rpc('get_review_stats', { u_id: user.id });
      if (!error && stats) {
        const combined: HeatmapData = { ...stats.history };
        Object.entries(stats.schedule as HeatmapData).forEach(([date, count]) => {
          combined[date] = (combined[date] || 0) + count;
        });
        setData(combined);
      }
    } catch (e) {
      console.error('Heatmap fetch error:', e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  const heatmapValues = useMemo(() => {
    return Object.entries(data).map(([date, count]) => ({ date, count }));
  }, [data]);

  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 0, 1);
  const endDate = new Date(currentYear, 11, 31);
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="heatmap-scroll-wrapper" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
      <div>
        <CalendarHeatmap
          startDate={startDate}
          endDate={endDate}
          values={heatmapValues}
          showWeekdayLabels={false}
          showMonthLabels={false}
          classForValue={(value) => {
            if (!value || value.count === 0) {
              return value?.date === todayStr ? 'color-empty color-today' : 'color-empty';
            }
            
            const isFuture = value.date > todayStr;
            const level = Math.min(Math.ceil(value.count / 3), 4); // Scale 1-4
            
            const baseClass = isFuture ? `color-gray-${level}` : `color-pink-${level}`;
            return value.date === todayStr ? `${baseClass} color-today` : baseClass;
          }}
          titleForValue={(value) => {
            if (!value) return 'No reviews';
            return `${value.date}: ${value.count} cards`;
          }}
        />
      </div>
    </div>
  );
}
