// src/charts.jsx — Hisobotlar uchun chart komponentlari (recharts)
// Bu fayl asosiy bundle'dan ajratilgan (vite.config.js manualChunks).

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, BarChart, Bar
} from 'recharts';

const fmt = (n) => new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));

const PALETTE_INC = ['#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5'];
const PALETTE_EXP = ['#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3'];

function Empty({ msg }) {
  return <div className="h-48 flex items-center justify-center text-sm text-slate-400">{msg}</div>;
}

// Tushum yoki chiqim kategoriyalari bo'yicha ulushlar
export function CategoryPie({ data, palette = 'income' }) {
  if (!data || data.length === 0) return <Empty msg="Ma'lumot yo'q" />;
  const colors = palette === 'income' ? PALETTE_INC : PALETTE_EXP;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          innerRadius={40}
          paddingAngle={2}
          label={(entry) => `${((entry.value / total) * 100).toFixed(0)}%`}
          labelLine={false}
          fontSize={11}
        >
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip
          formatter={(value, name) => [`${fmt(value)} so'm`, name]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Kunlik tushum/chiqim trend
export function DailyLineChart({ data }) {
  if (!data || data.length === 0) return <Empty msg="Ma'lumot yo'q" />;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
        <Tooltip
          formatter={(v) => `${fmt(v)} so'm`}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="income" stroke="#059669" strokeWidth={2} dot={{ r: 2 }} name="Tushum" />
        <Line type="monotone" dataKey="expense" stroke="#e11d48" strokeWidth={2} dot={{ r: 2 }} name="Chiqim" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Sof natija (income - expense) bar chart
export function NetBarChart({ data }) {
  if (!data || data.length === 0) return <Empty msg="Ma'lumot yo'q" />;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
        <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${Math.round(v / 1000)}k` : v} />
        <Tooltip
          formatter={(v) => `${fmt(v)} so'm`}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="net" name="Sof natija">
          {data.map((d, i) => (
            <Cell key={i} fill={d.net >= 0 ? '#059669' : '#e11d48'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
