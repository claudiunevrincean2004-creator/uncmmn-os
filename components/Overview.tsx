'use client';
import { Client, Post, Expense } from '@/lib/types';
import { fn, fm, avg, er, getColor } from '@/lib/utils';

interface Props {
  clients: Client[];
  posts: Post[];
  expenses: Expense[];
  onSelectClient: (id: string) => void;
}

export default function Overview({ clients, posts, expenses, onSelectClient }: Props) {
  const totalRevenue = clients.reduce((s, c) => s + (c.retainer || 0), 0);
  const totalClientCosts = clients.reduce((s, c) => s + (c.cost || 0), 0);
  const totalExpenses = expenses.reduce((s, e) => s + (e.cost || 0), 0);
  const netProfit = totalRevenue - totalClientCosts - totalExpenses;
  const totalPosts = posts.length;

  // Top outlier post globally
  const allAvgViews = avg(posts.map(p => p.views));
  const topOutlier = [...posts].filter(p => p.views >= allAvgViews * 1.5).sort((a, b) => b.views - a.views)[0];
  const topOutlierClient = topOutlier ? clients.find(c => c.id === topOutlier.client_id) : null;

  // Revenue by client
  const clientRevenue = clients.map((c, i) => ({
    client: c,
    revenue: c.retainer || 0,
    cost: c.cost || 0,
    profit: (c.retainer || 0) - (c.cost || 0),
    color: getColor(i),
  })).sort((a, b) => b.revenue - a.revenue);

  const maxRevenue = Math.max(...clientRevenue.map(c => c.revenue), 1);

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Overview</div>
        <div style={{ fontSize: 12, color: '#444' }}>Agency-wide performance summary</div>
      </div>

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Monthly Revenue', value: fm(totalRevenue), sub: `${clients.length} clients` },
          { label: 'Net Profit', value: fm(netProfit), sub: `after expenses`, color: netProfit >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Total Clients', value: String(clients.length), sub: 'active' },
          { label: 'Total Posts', value: String(totalPosts), sub: 'across all clients' },
        ].map(m => (
          <div key={m.label} className="metric-chip">
            <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontWeight: 600 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: (m as any).color || '#fff', marginBottom: 3 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: '#444' }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* Revenue by client */}
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenue by Client</div>
          {clients.length === 0 ? (
            <div style={{ color: '#333', fontSize: 12 }}>No clients yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clientRevenue.map(cr => (
                <div key={cr.client.id} style={{ cursor: 'pointer' }} onClick={() => onSelectClient(cr.client.id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12 }}>{cr.client.name}</span>
                    <span style={{ fontSize: 11, color: '#555' }}>{fm(cr.revenue)}</span>
                  </div>
                  <div style={{ height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${(cr.revenue / maxRevenue) * 100}%`, background: cr.color, borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top outlier post */}
        <div className="card">
          <div style={{ fontSize: 11, color: '#555', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Outlier Post</div>
          {topOutlier ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <span className="badge badge-outlier" style={{ marginTop: 1 }}>Outlier</span>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{topOutlier.title}</div>
              </div>
              {topOutlierClient && (
                <div style={{ fontSize: 11, color: '#555', marginBottom: 10 }}>
                  {topOutlierClient.name} · {topOutlier.platform}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { l: 'Views', v: fn(topOutlier.views) },
                  { l: 'Likes', v: fn(topOutlier.likes) },
                  { l: 'ER%', v: `${er(topOutlier).toFixed(1)}%` },
                ].map(m => (
                  <div key={m.l}>
                    <div style={{ fontSize: 10, color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{m.l}</div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{m.v}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: '#444' }}>
                {fn(topOutlier.views / Math.max(allAvgViews, 1))}× above average ({fn(allAvgViews)} avg)
              </div>
            </div>
          ) : (
            <div style={{ color: '#333', fontSize: 12 }}>No outlier posts found yet</div>
          )}
        </div>
      </div>

      {/* Client table */}
      <div className="card">
        <div style={{ fontSize: 11, color: '#555', marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>All Clients</div>
        {clients.length === 0 ? (
          <div style={{ color: '#333', fontSize: 12 }}>No clients yet. Add your first client from the sidebar.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Niche</th>
                <th>Platforms</th>
                <th>Retainer</th>
                <th>Cost</th>
                <th>Profit</th>
                <th>Posts</th>
              </tr>
            </thead>
            <tbody>
              {clientRevenue.map(cr => {
                const clientPosts = posts.filter(p => p.client_id === cr.client.id);
                return (
                  <tr key={cr.client.id} style={{ cursor: 'pointer' }} onClick={() => onSelectClient(cr.client.id)}>
                    <td style={{ color: '#fff', fontWeight: 600 }}>{cr.client.name}</td>
                    <td style={{ color: '#555' }}>{cr.client.niche || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {(cr.client.platforms || []).map(p => (
                          <span key={p} style={{ fontSize: 9, padding: '2px 5px', borderRadius: 4, border: '0.5px solid #2a2a2a', color: '#555' }}>{p}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ color: '#10b981' }}>{fm(cr.revenue)}</td>
                    <td style={{ color: '#555' }}>{fm(cr.cost)}</td>
                    <td style={{ color: cr.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fm(cr.profit)}</td>
                    <td style={{ color: '#555' }}>{clientPosts.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
