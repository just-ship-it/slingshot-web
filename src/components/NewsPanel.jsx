import React, { useState, useEffect } from 'react';

const NewsPanel = ({ socket, isLoading = false }) => {
  const [marketNews, setMarketNews] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchMarketNews();
  }, []);

  useEffect(() => {
    if (socket && typeof socket.subscribe === 'function') {
      const handleMarketNews = (newsItem) => {
        console.log('📰 Real-time market news received:', newsItem);
        setMarketNews(prev => [newsItem, ...prev.slice(0, 199)]);
      };

      socket.subscribe('market_news', handleMarketNews);

      return () => {
        if (typeof socket.unsubscribe === 'function') {
          socket.unsubscribe('market_news', handleMarketNews);
        }
      };
    } else {
      console.warn('NewsPanel: socket is not available or does not have subscribe method:', socket);
    }
  }, [socket]);

  const fetchMarketNews = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/market-news?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const news = await response.json();
        setMarketNews(news);
      }
    } catch (error) {
      console.error('Failed to fetch market news:', error);
    }
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'kalshiMarket': return '📈';
      case 'kalshiMilestone': return '🎯';
      case 'kalshiStructuredTarget': return '🎲';
      default: return '📰';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'opened':
        return 'text-green-400';
      case 'closed':
      case 'settled':
        return 'text-gray-400';
      case 'suspended':
        return 'text-yellow-400';
      default:
        return 'text-blue-400';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const filteredNews = filter === 'all'
    ? marketNews
    : marketNews.filter(item => item.type === filter);

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">📰 Market News</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-gray-700 rounded">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-600 rounded w-3/4"></div>
                <div className="h-3 bg-gray-600 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">📰 Market News</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{filteredNews.length} events</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
          >
            <option value="all">All Events</option>
            <option value="kalshiMarket">Markets</option>
            <option value="kalshiMilestone">Milestones</option>
            <option value="kalshiStructuredTarget">Targets</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {filteredNews.length > 0 ? (
          filteredNews.map((newsItem, index) => (
            <div
              key={newsItem.id || index}
              className="p-3 bg-gray-700 rounded hover:bg-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getEventIcon(newsItem.type)}</span>
                    <span className="font-medium text-white text-sm">
                      {newsItem.title}
                    </span>
                    <span className={`text-xs ${getStatusColor(newsItem.status)}`}>
                      {newsItem.status}
                    </span>
                  </div>

                  {newsItem.description && (
                    <p className="text-sm text-gray-300 mb-1 line-clamp-2">
                      {newsItem.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{formatTime(newsItem.timestamp)}</span>
                    <span className="capitalize">{newsItem.eventType}</span>
                    {newsItem.result && (
                      <span className="text-green-400">Result: {newsItem.result}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-400">
            <p className="text-sm">No market events yet</p>
            <p className="text-xs mt-1">Kalshi market data will appear here when available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPanel;