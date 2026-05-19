import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
// @ts-ignore
import CalendarHeatmap from 'react-calendar-heatmap';
import 'react-calendar-heatmap/dist/styles.css';

interface HeatmapData {
  [date: string]: number;
}

export default function ReviewHeatmap() {
  const { user, isGuest, loadGuestReviews } = useAuth();
  const [data, setData] = useState<HeatmapData>({});

  const fetchStats = async () => {
    if (isGuest) {
      try {
        const guestReviews = loadGuestReviews();
        const heatmapData: HeatmapData = {};
        guestReviews.forEach(review => {
          const reviewDate = review.next_review_date.split('T')[0];
          heatmapData[reviewDate] = (heatmapData[reviewDate] || 0) + 1;
        });
        setData(heatmapData);
      } catch (e) {
        console.error('Guest heatmap fetch error:', e);
      }
      return;
    }
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
  }, [user, isGuest, loadGuestReviews]);

  const heatmapValues = useMemo(() => {
    return Object.entries(data).map(([date, count]) => ({ date, count }));
  }, [data]);

  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 0, 1);
  const endDate = new Date(currentYear, 11, 31);
  const todayStr = new Date().toISOString().split('T')[0];

  // Stats derived from data
  const dueToday = data[todayStr] ?? 0;

  const totalReviewed = useMemo(() => {
    return Object.entries(data)
      .filter(([date]) => date <= todayStr)
      .reduce((sum, [, count]) => sum + count, 0);
  }, [data, todayStr]);

  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date();
    // If nothing logged today, start checking from yesterday
    if (!data[todayStr]) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      const d = cursor.toISOString().split('T')[0];
      if (data[d] > 0) {
        count++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return count;
  }, [data, todayStr]);

  return (
    <div>

      <div className="heatmap-scroll-wrapper" style={{ marginTop: '0.5rem', marginBottom: '0.5rem'}}>
        <div>
          <CalendarHeatmap
            startDate={startDate}
            endDate={endDate}
            values={heatmapValues}
            showWeekdayLabels={false}
            showMonthLabels={false}
            classForValue={(value: any) => {
              if (!value || value.count === 0) {
                return value?.date === todayStr ? 'color-empty color-today' : 'color-empty';
              }
              const isFuture = value.date > todayStr;
              const level = Math.min(Math.ceil(value.count / 3), 4);
              const baseClass = isFuture ? `color-gray-${level}` : `color-pink-${level}`;
              return value.date === todayStr ? `${baseClass} color-today` : baseClass;
            }}
            titleForValue={(value: any) => {
              if (!value) return 'No reviews';
              return `${value.date}: ${value.count} cards`;
            }}
          />
        </div>


      </div>
      <div className="hm-stats">
        <div className="hm-stat">
          <span className="hm-stat-val">{streak}</span>
          <span className="hm-stat-lbl">day streak</span>
        </div>
        <div className="hm-stat">
          <span className="hm-stat-val">{totalReviewed.toLocaleString()}</span>
          <span className="hm-stat-lbl">cards reviewed</span>
        </div>
        <div className="hm-stat">
          <span className="hm-stat-val">{dueToday}</span>
          <span className="hm-stat-lbl">Scheduled</span>
        </div>
      </div>
    </div>
  );
}