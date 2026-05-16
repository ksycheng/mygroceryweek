import { useState, useEffect, useRef } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://dmulrdxytfzyuftwwbrn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdWxyZHh5dGZ6eXVmdHd3YnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NjIyMTcsImV4cCI6MjA5NDAzODIxN30.XY6X_DWr_Ygq-w2zngjWu5sBofrCTNaRgohgVYVXeD8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = {
  Produce: ["apple","banana","orange","lettuce","spinach","tomato","potato","onion","garlic","carrot","broccoli","pepper","cucumber","avocado","lemon","lime","grape","strawberry","blueberry","mushroom","celery","zucchini","corn","pea","bean","herb","cilantro","parsley","ginger","sweet potato"],
  Dairy: ["milk","cheese","butter","yogurt","cream","egg","sour cream","cottage cheese","cream cheese","half and half","whipped cream","kefir","cheddar","mozzarella","parmesan","feta"],
  Meat: ["chicken","beef","pork","turkey","salmon","tuna","shrimp","bacon","sausage","lamb","steak","ground beef","hot dog","fish","cod","tilapia","ground turkey","ham"],
  Bakery: ["bread","bagel","muffin","croissant","roll","bun","tortilla","pita","wrap","cake","pie","donut","naan","baguette"],
  Pantry: ["rice","pasta","flour","sugar","salt","pepper","oil","vinegar","sauce","soup","canned","cereal","oat","coffee","tea","juice","water","soda","chip","cracker","cookie","chocolate","honey","jam","peanut butter","mustard","ketchup","mayo","soy sauce","coconut milk","broth","stock","olive oil","breadcrumb","panko"],
  Frozen: ["frozen","ice cream","pizza","waffle","fries","edamame"],
  Household: ["soap","shampoo","toothpaste","toilet paper","paper towel","detergent","cleaner","trash bag","foil","wrap","bag","dish"],
};

const CATEGORY_META = {
  Produce:   { bg: "#e8f5e0", accent: "#3d8c23", icon: "🥦" },
  Dairy:     { bg: "#e8f0fc", accent: "#3a6fd8", icon: "🥛" },
  Meat:      { bg: "#fde8e8", accent: "#c0392b", icon: "🥩" },
  Bakery:    { bg: "#fef3e2", accent: "#d4870a", icon: "🍞" },
  Pantry:    { bg: "#f5f0e8", accent: "#8b6914", icon: "🫙" },
  Frozen:    { bg: "#e8f7fc", accent: "#1a8fa8", icon: "🧊" },
  Household: { bg: "#f2e8fc", accent: "#7b3fa8", icon: "🧴" },
  Other:     { bg: "#f0f0f0", accent: "#666",    icon: "📦" },
};

function categorize(item) {
  const lower = item.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORIES))
    if (kws.some(k => lower.includes(k))) return cat;
  return "Other";
}
function formatPostalCode(v) {
  const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length <= 3 ? c : c.slice(0, 3) + " " + c.slice(3, 6);
}
function isValidPostal(v) { return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(v); }

const CUISINE_OPTIONS = ["Italian","Asian","Mexican","Canadian/American","Indian","Mediterranean","Middle Eastern","French","Greek","Japanese","Thai","Vegetarian","Vegan","Keto/Low-carb","BBQ & Comfort Food"];
const MEAL_TYPES = ["Breakfast","Lunch","Dinner","Snacks & Desserts"];
const DIFFICULTY_COLOR = { Easy: "#3d8c23", Medium: "#d4870a", Hard: "#c0392b" };

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #f7f4ef; }
  :root {
    --green: #2d5a1b; --green-light: #3d8c23; --green-pale: #e8f5e0;
    --cream: #f7f4ef; --card: #ffffff; --border: #e2dbd0;
    --text: #1a1a1a; --muted: #7a7060; --red: #c0392b;
    --shadow: 0 1px 3px rgba(0,0,0,0.07), 0 4px 12px rgba(0,0,0,0.05);
  }
  .fade-in { animation: fadeIn 0.35s ease both; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }
  .pill { display:inline-flex; align-items:center; gap:4px; padding:5px 12px; border-radius:99px; font-size:13px; font-weight:500; cursor:pointer; border:1.5px solid transparent; transition:all 0.18s; font-family:'DM Sans',sans-serif; }
  .pill.selected { background:var(--green); color:#fff; border-color:var(--green); }
  .pill.unselected { background:#fff; color:var(--muted); border-color:var(--border); }
  .pill.unselected:hover { border-color:var(--green-light); color:var(--green); }
  .btn-primary { background:var(--green); color:#fff; border:none; border-radius:10px; padding:13px 24px; font-size:15px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.18s; box-shadow:0 4px 14px rgba(45,90,27,0.3); }
  .btn-primary:hover { background:var(--green-light); transform:translateY(-1px); }
  .btn-primary:disabled { background:#aaa; box-shadow:none; cursor:not-allowed; transform:none; }
  .btn-ghost { background:none; border:1.5px solid var(--border); border-radius:10px; padding:11px 20px; font-size:14px; font-weight:500; cursor:pointer; font-family:'DM Sans',sans-serif; color:var(--muted); transition:all 0.18s; }
  .btn-ghost:hover { border-color:var(--green); color:var(--green); }
  .input { width:100%; border:1.5px solid var(--border); border-radius:10px; padding:11px 14px; font-size:15px; font-family:'DM Sans',sans-serif; background:#fff; color:var(--text); outline:none; transition:border 0.18s; }
  .input:focus { border-color:var(--green-light); }
  .card { background:var(--card); border-radius:14px; border:1px solid var(--border); box-shadow:var(--shadow); }
  .section-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:var(--muted); margin-bottom:10px; font-family:'DM Sans',sans-serif; }
  .budget-bar-wrap { height:10px; background:#e8e0d0; border-radius:99px; overflow:hidden; margin-top:6px; }
  .budget-bar { height:100%; border-radius:99px; transition:width 0.5s ease; }
  .dish-card { background:#fff; border-radius:14px; border:1px solid var(--border); box-shadow:var(--shadow); overflow:hidden; cursor:pointer; transition:all 0.2s; }
  .dish-card:hover { transform:translateY(-2px); box-shadow:0 4px 20px rgba(0,0,0,0.12); }
  .step-num { width:28px; height:28px; border-radius:50%; background:var(--green); color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; flex-shrink:0; }
`;

function Sparkline({ weeks }) {
  if (!weeks || weeks.length < 2) return null;
  const vals = weeks.map(w => w.spent);
  const max = Math.max(...vals, 1);
  const W = 120, H = 36;
  const pts = vals.map((v, i) => ((i / (vals.length - 1)) * W) + "," + (H - (v / max) * H)).join(" ");
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke="#3d8c23" strokeWidth="2" strokeLinejoin="round" />
      {vals.map((v, i) => <circle key={i} cx={(i / (vals.length - 1)) * W} cy={H - (v / max) * H} r="3" fill="#3d8c23" />)}
    </svg>
  );
}

async function callGemini(system, prompt) {
  const res = await fetch("/api/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authName, setAuthName] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [obStep, setObStep] = useState(0);
  const [obBudget, setObBudget] = useState("");
  const [obPeople, setObPeople] = useState(2);
  const [obMeals, setObMeals] = useState([]);
  const [obCuisines, setObCuisines] = useState([]);
  const [obPostal, setObPostal] = useState("");
  const [obPostalIn, setObPostalIn] = useState("");
  const [items, setItems] = useState([]);
  const [itemInput, setItemInput] = useState("");
  const [checked, setChecked] = useState({});
  const [tab, setTab] = useState("list");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [weekSpend, setWeekSpend] = useState(null);
  const [history, setHistory] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [dishesLoading, setDishesLoading] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [haveIngredients, setHaveIngredients] = useState({});
  const [dishError, setDishError] = useState("");
  const [listId, setListId] = useState(null);
  const itemInputRef = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setTimeout(() => setScreen("login"), 1200);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setScreen("login");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (prof) {
      setProfile(prof);
      setScreen("main");
      loadGroceryList(userId);
      loadHistory(userId);
    } else {
      setScreen("onboard");
    }
  };

  const loadGroceryList = async (userId) => {
    const { data } = await supabase.from("grocery_lists").select("*").eq("user_id", userId).single();
    if (data) {
      setListId(data.id);
      setItems(data.items || []);
    } else {
      const { data: newList } = await supabase.from("grocery_lists").insert({ user_id: userId, items: [] }).select().single();
      if (newList) setListId(newList.id);
    }
  };

  const loadHistory = async (userId) => {
    const { data } = await supabase.from("spending_history").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(12);
    if (data) setHistory(data);
  };

  const saveList = async (newItems) => {
    if (!user || !listId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("grocery_lists").update({ items: newItems, updated_at: new Date().toISOString() }).eq("id", listId);
    }, 1000);
  };

  const handleLogin = async () => {
    setAuthErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPass });
    if (error) setAuthErr("Invalid email or password.");
  };

  const handleSignup = async () => {
    if (!authName || !authEmail || !authPass) { setAuthErr("Please fill in all fields."); return; }
    setAuthErr("");
    const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPass });
    if (error) { setAuthErr(error.message); return; }
    if (data.user) {
      setUser(data.user);
      setScreen("onboard");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setItems([]); setResults(null); setHistory([]); setProfile(null);
  };

  const saveOnboarding = async () => {
    const prof = { id: user.id, name: authName || user.email.split("@")[0], budget: parseFloat(obBudget), people: obPeople, meals: obMeals, cuisines: obCuisines, postal: obPostal };
    const { error } = await supabase.from("profiles").upsert(prof);
    if (!error) {
      setProfile(prof);
      await supabase.from("grocery_lists").insert({ user_id: user.id, items: [] });
      setScreen("main");
      loadGroceryList(user.id);
    }
  };

  const suggestGroceries = async () => {
    if (!profile) return;
    setAiLoading(true); setSuggestions([]);
    try {
      const system = "You are a meal planning assistant. Return ONLY a JSON array of grocery item strings, no markdown, no explanation.";
      const prompt = "Suggest a weekly grocery list for " + profile.people + " people who enjoy " + (profile.cuisines||[]).join(", ") + " cuisine. Budget $" + profile.budget + " CAD. Return 15-25 items as a JSON array of strings.";
      const text = await callGemini(system, prompt);
      const clean = text.replace(/```json|```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) setSuggestions(JSON.parse(match[0]));
    } catch (e) { setError("Could not load suggestions."); }
    finally { setAiLoading(false); }
  };

  const loadDishes = async () => {
    if (!profile) return;
    setDishesLoading(true); setDishError(""); setDishes([]); setSelectedDish(null);
    try {
      const system = "You are a creative chef. Return ONLY valid JSON, no markdown, no code blocks.";
      const prompt = "Suggest 5 dishes for " + profile.people + " people who enjoy " + (profile.cuisines||[]).join(", ") + " cuisine for " + (profile.meals||[]).join(" and ") + ". Return ONLY this JSON array: [{\"name\":\"Dish Name\",\"emoji\":\"🍝\",\"cuisine\":\"Italian\",\"cookTime\":\"30 mins\",\"difficulty\":\"Easy\",\"servings\":" + profile.people + ",\"description\":\"One sentence\",\"ingredients\":[{\"name\":\"ingredient\",\"amount\":\"2\",\"unit\":\"cups\"}],\"steps\":[\"Step 1\",\"Step 2\"]}]";
      const text = await callGemini(system, prompt);
      const clean = text.replace(/```json|```/g, "").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("parse fail");
      setDishes(JSON.parse(match[0]));
    } catch (e) { setDishError("Could not load dish suggestions. Please try again."); }
    finally { setDishesLoading(false); }
  };

  const addMissingToList = () => {
    if (!selectedDish) return;
    const missing = selectedDish.ingredients.filter((_, idx) => !haveIngredients[idx]);
    const newItems = missing.map(ing => ({ id: Date.now() + Math.random(), name: ing.amount + " " + ing.unit + " " + ing.name, category: categorize(ing.name) }));
    const updated = [...items];
    newItems.forEach(ni => { if (!updated.find(i => i.name.toLowerCase() === ni.name.toLowerCase())) updated.push(ni); });
    setItems(updated);
    saveList(updated);
    setSelectedDish(null); setHaveIngredients({}); setTab("list");
    alert(missing.length + " ingredient" + (missing.length !== 1 ? "s" : "") + " added to your grocery list!");
  };

  const addSuggestion = (s) => {
    if (items.find(i => i.name.toLowerCase() === s.toLowerCase())) return;
    const updated = [...items, { id: Date.now() + Math.random(), name: s, category: categorize(s) }];
    setItems(updated); saveList(updated);
  };

  // FIX 1: Removed setResults(null) so prices don't reset when adding items
  const addItem = () => {
    const t = itemInput.trim(); if (!t) return;
    const updated = [...items, { id: Date.now(), name: t, category: categorize(t) }];
    setItems(updated); saveList(updated);
    setItemInput("");
    if (itemInputRef.current) itemInputRef.current.focus();
  };

  // FIX 1: Removed setResults(null) so prices don't reset when removing items
  const removeItem = (id) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated); saveList(updated);
  };

  const toggleCheck = (id) => setChecked(p => ({ ...p, [id]: !p[id] }));

  const findPrices = async () => {
    if (items.length === 0) { setError("Add items to your list first!"); return; }
    if (!profile || !profile.postal) { setError("No postal code found."); return; }
    setError(""); setLoading(true); setResults(null);
    const itemNames = items.map(i => i.name).join(", ");
    const budget = profile.budget || 200;
    const postalPrefix = profile.postal.slice(0, 3);
    try {
      const system = "You are a Canadian grocery price comparison expert. Return ONLY valid JSON with no markdown, no code blocks.";
      // FIX 2: Much more explicit location instruction
      const prompt = "Find best grocery prices for stores specifically located in or nearest to Canadian postal code " + profile.postal + " (postal prefix " + postalPrefix + ", Ontario). You MUST only suggest real supermarkets that are actually located close to this specific postal code area. Do not suggest stores in other cities. Items: " + itemNames + ". Budget: $" + budget + " CAD.\n\nReturn ONLY this JSON:\n{\"combinations\":[{\"rank\":1,\"label\":\"Store name\",\"stores\":[\"Store\"],\"totalCAD\":0.00,\"savingsVsWorst\":0.00,\"trips\":1,\"breakdown\":[{\"store\":\"Store\",\"items\":[\"item\"],\"subtotal\":0.00}],\"tip\":\"tip\"},{\"rank\":2,\"label\":\"Two stores\",\"stores\":[\"Store A\",\"Store B\"],\"totalCAD\":0.00,\"savingsVsWorst\":0.00,\"trips\":2,\"breakdown\":[{\"store\":\"Store A\",\"items\":[\"item\"],\"subtotal\":0.00}],\"tip\":\"tip\"},{\"rank\":3,\"label\":\"Three stores\",\"stores\":[\"Store A\",\"Store B\",\"Store C\"],\"totalCAD\":0.00,\"savingsVsWorst\":0.00,\"trips\":3,\"breakdown\":[{\"store\":\"Store A\",\"items\":[\"item\"],\"subtotal\":0.00}],\"tip\":\"tip\"}],\"budgetCAD\":" + budget + ",\"withinBudget\":true,\"overBy\":0.00,\"perItemPrices\":[{\"name\":\"item\",\"store\":\"store\",\"price\":0.00}]}\n\nAll prices in CAD. Stores must be near postal code " + profile.postal + ".";
      const text = await callGemini(system, prompt);
      const clean = text.replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("parse fail");
      const parsed = JSON.parse(match[0]);
      setResults(parsed);
      setWeekSpend(parsed.combinations?.[0]?.totalCAD || 0);
      setTab("compare");
    } catch (e) { setError("Could not fetch prices. Please try again."); }
    finally { setLoading(false); }
  };

  const saveWeek = async () => {
    if (!results || !user) return;
    const best = results.combinations?.[0];
    const week = { user_id: user.id, date: new Date().toISOString().split("T")[0], spent: best?.totalCAD || 0, store: best?.label || "", budget: profile?.budget || 0, items: items.map(i => i.name) };
    const { error } = await supabase.from("spending_history").insert(week);
    if (!error) { loadHistory(user.id); alert("Week saved to your history!"); }
  };

  const grouped = items.reduce((acc, item) => { (acc[item.category] = acc[item.category] || []).push(item); return acc; }, {});
  const budget = profile?.budget || 0;
  const avgSpend = history.length ? (history.reduce((s, w) => s + (w.spent || 0), 0) / history.length).toFixed(2) : null;
  const spentPct = weekSpend && budget ? Math.min((weekSpend / budget) * 100, 100) : 0;
  const overBudget = weekSpend && budget && weekSpend > budget;

  if (screen === "splash") return (
    <div style={{ minHeight:"100vh", background:"#2d5a1b", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
      <style>{css}</style>
      <div style={{ fontSize:52, marginBottom:16 }}>🛒</div>
      <h1 style={{ fontFamily:"'DM Serif Display',serif", color:"#e8f5e0", fontSize:32 }}>MyGroceryWeek</h1>
      <p style={{ color:"#8fa87a", marginTop:8, fontFamily:"'DM Sans',sans-serif", fontSize:14 }}>Smart Canadian grocery planning</p>
    </div>
  );

  if (screen === "login") return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{css}</style>
      <div style={{ width:"100%", maxWidth:380 }} className="fade-in">
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🛒</div>
          <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:"#2d5a1b" }}>MyGroceryWeek</h1>
          <p style={{ color:"#7a7060", fontSize:14, marginTop:4 }}>Smart Canadian grocery planning</p>
        </div>
        <div className="card" style={{ padding:24 }}>
          <p className="section-label">Sign In</p>
          {authErr && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:8, padding:"10px 14px", marginBottom:14, color:"#c0392b", fontSize:13 }}>⚠️ {authErr}</div>}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input className="input" placeholder="Email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <input className="input" type="password" placeholder="Password" value={authPass} onChange={e => setAuthPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} />
            <button className="btn-primary" style={{ width:"100%", marginTop:4 }} onClick={handleLogin}>Sign In</button>
          </div>
          <p style={{ textAlign:"center", marginTop:16, fontSize:14, color:"#7a7060" }}>
            No account? <span style={{ color:"#2d5a1b", fontWeight:600, cursor:"pointer" }} onClick={() => { setAuthErr(""); setScreen("signup"); }}>Create one</span>
          </p>
        </div>
      </div>
    </div>
  );

  if (screen === "signup") return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{css}</style>
      <div style={{ width:"100%", maxWidth:380 }} className="fade-in">
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🛒</div>
          <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:"#2d5a1b" }}>Create Account</h1>
          <p style={{ color:"#7a7060", fontSize:14, marginTop:4 }}>Start saving on groceries today</p>
        </div>
        <div className="card" style={{ padding:24 }}>
          {authErr && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:8, padding:"10px 14px", marginBottom:14, color:"#c0392b", fontSize:13 }}>⚠️ {authErr}</div>}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input className="input" placeholder="Your name" value={authName} onChange={e => setAuthName(e.target.value)} />
            <input className="input" placeholder="Email address" value={authEmail} onChange={e => setAuthEmail(e.target.value)} />
            <input className="input" type="password" placeholder="Choose a password" value={authPass} onChange={e => setAuthPass(e.target.value)} />
            <button className="btn-primary" style={{ width:"100%", marginTop:4 }} onClick={handleSignup}>Create Account</button>
          </div>
          <p style={{ textAlign:"center", marginTop:16, fontSize:14, color:"#7a7060" }}>
            Have an account? <span style={{ color:"#2d5a1b", fontWeight:600, cursor:"pointer" }} onClick={() => { setAuthErr(""); setScreen("login"); }}>Sign in</span>
          </p>
        </div>
      </div>
    </div>
  );

  if (screen === "onboard") {
    const steps = [
      { title:"Your weekly budget", subtitle:"We'll alert you if you're overspending" },
      { title:"Who are you shopping for?", subtitle:"Helps us suggest the right quantities" },
      { title:"What meals do you need?", subtitle:"Pick all that apply" },
      { title:"Cuisine preferences", subtitle:"We'll tailor grocery suggestions to your taste" },
      { title:"Your location", subtitle:"To find nearby Canadian supermarkets" },
    ];
    const s = steps[obStep];
    const canNext = [obBudget && parseFloat(obBudget) > 0, true, obMeals.length > 0, obCuisines.length > 0, isValidPostal(obPostal)][obStep];
    return (
      <div style={{ minHeight:"100vh", background:"#f7f4ef", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"'DM Sans',sans-serif" }}>
        <style>{css}</style>
        <div style={{ width:"100%", maxWidth:420 }} className="fade-in">
          <div style={{ display:"flex", gap:6, marginBottom:28 }}>
            {steps.map((_, i) => <div key={i} style={{ flex:1, height:4, borderRadius:99, background:i<=obStep?"#2d5a1b":"#e2dbd0", transition:"background 0.3s" }} />)}
          </div>
          <div className="card" style={{ padding:28 }}>
            <p style={{ fontSize:13, color:"#7a7060", marginBottom:4 }}>Step {obStep+1} of {steps.length}</p>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, color:"#2d5a1b", marginBottom:4 }}>{s.title}</h2>
            <p style={{ fontSize:14, color:"#7a7060", marginBottom:24 }}>{s.subtitle}</p>
            {obStep===0&&(<div style={{ position:"relative" }}><span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7a7060" }}>$</span><input className="input" style={{ paddingLeft:28 }} type="number" placeholder="e.g. 200" value={obBudget} onChange={e=>setObBudget(e.target.value)}/><p style={{ fontSize:12, color:"#aaa", marginTop:6 }}>Per week, in Canadian dollars</p></div>)}
            {obStep===1&&(<div style={{ display:"flex", alignItems:"center", gap:16, justifyContent:"center", padding:"8px 0" }}><button className="btn-ghost" style={{ fontSize:22, padding:"10px 18px" }} onClick={()=>setObPeople(Math.max(1,obPeople-1))}>-</button><div style={{ textAlign:"center" }}><div style={{ fontSize:40, fontFamily:"'DM Serif Display',serif", color:"#2d5a1b" }}>{obPeople}</div><div style={{ fontSize:13, color:"#7a7060" }}>people</div></div><button className="btn-ghost" style={{ fontSize:22, padding:"10px 18px" }} onClick={()=>setObPeople(Math.min(12,obPeople+1))}>+</button></div>)}
            {obStep===2&&(<div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{MEAL_TYPES.map(m=><span key={m} className={"pill "+(obMeals.includes(m)?"selected":"unselected")} onClick={()=>setObMeals(p=>p.includes(m)?p.filter(x=>x!==m):[...p,m])}>{m}</span>)}</div>)}
            {obStep===3&&(<div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{CUISINE_OPTIONS.map(c=><span key={c} className={"pill "+(obCuisines.includes(c)?"selected":"unselected")} onClick={()=>setObCuisines(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])}>{c}</span>)}</div>)}
            {obStep===4&&(<div><input className="input" placeholder="e.g. M5V 3A8" value={obPostalIn} maxLength={7} onChange={e=>{const f=formatPostalCode(e.target.value);setObPostalIn(f);if(isValidPostal(f))setObPostal(f);else setObPostal("");}} style={{ textTransform:"uppercase", letterSpacing:"1px" }}/><p style={{ fontSize:12, color:"#aaa", marginTop:6 }}>Canadian postal code: A1A 1A1</p>{isValidPostal(obPostal)&&<p style={{ fontSize:13, color:"#3d8c23", marginTop:6 }}>Valid postal code ✓</p>}</div>)}
            <div style={{ display:"flex", gap:10, marginTop:28 }}>
              {obStep>0&&<button className="btn-ghost" style={{ flex:1 }} onClick={()=>setObStep(s=>s-1)}>Back</button>}
              <button className="btn-primary" style={{ flex:2 }} disabled={!canNext} onClick={()=>{if(obStep<steps.length-1)setObStep(s=>s+1);else saveOnboarding();}}>{obStep===steps.length-1?"Let's go!":"Continue"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", fontFamily:"'DM Sans',sans-serif", color:"#1a1a1a" }}>
      <style>{css}</style>
      <div style={{ background:"#2d5a1b", padding:"20px 20px 0", position:"sticky", top:0, zIndex:20, boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#e8f5e0", margin:0 }}>🛒 MyGroceryWeek</h1>
              <p style={{ fontSize:12, color:"#8fa87a", margin:0 }}>Hi {profile?.name?.split(" ")[0] || ""} - {profile?.postal || ""}</p>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {results&&<button onClick={saveWeek} style={{ background:"#e8f5e0", color:"#2d5a1b", border:"none", borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>💾 Save Week</button>}
              <button onClick={handleLogout} style={{ background:"none", border:"1px solid #4a7a30", borderRadius:8, padding:"7px 12px", fontSize:12, color:"#8fa87a", cursor:"pointer" }}>Sign out</button>
            </div>
          </div>
          {budget>0&&(
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#8fa87a", marginBottom:4 }}>
                <span>{overBudget?"Over budget!":"Budget: $"+budget+" CAD/week"}</span>
                {weekSpend&&<span style={{ color:overBudget?"#ff9a8a":"#a8d878", fontWeight:600 }}>${weekSpend.toFixed(2)} spent</span>}
              </div>
              <div className="budget-bar-wrap"><div className="budget-bar" style={{ width:spentPct+"%", background:overBudget?"#c0392b":spentPct>80?"#d4870a":"#3d8c23" }} /></div>
            </div>
          )}
          <div style={{ display:"flex" }}>
            {[["list","📋 List"],["meals","🍽️ Meals"],["compare","📊 Compare"],["history","📈 History"]].map(([t,l])=>(
              <button key={t} onClick={()=>setTab(t)} style={{ flex:1, background:"none", border:"none", padding:"10px 0", fontSize:12, fontWeight:600, color:tab===t?"#e8f5e0":"#6a8a5a", borderBottom:tab===t?"2px solid #e8f5e0":"2px solid transparent", cursor:"pointer", transition:"all 0.18s" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:"0 auto", padding:"20px 16px 48px" }} className="fade-in">

        {tab==="list"&&(
          <div>
            <div className="card" style={{ padding:16, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <p className="section-label" style={{ margin:0 }}>✨ AI Suggestions</p>
                <button onClick={suggestGroceries} disabled={aiLoading} style={{ background:"#e8f5e0", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#2d5a1b", cursor:"pointer" }}>
                  {aiLoading?"Loading...":suggestions.length?"Refresh":"Suggest for me"}
                </button>
              </div>
              {aiLoading&&<p style={{ fontSize:13, color:"#aaa", fontStyle:"italic" }}>Generating suggestions...</p>}
              {suggestions.length>0&&(
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {suggestions.map((s,i)=>{
                    const already=items.find(it=>it.name.toLowerCase()===s.toLowerCase());
                    return <span key={i} onClick={()=>!already&&addSuggestion(s)} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 11px", borderRadius:99, fontSize:13, cursor:already?"default":"pointer", background:already?"#f0f0f0":"#fff", color:already?"#bbb":"#2d5a1b", border:"1.5px solid "+(already?"#e0e0e0":"#b8dba0"), fontWeight:500 }}>{already?"Added":"+"} {s}</span>;
                  })}
                </div>
              )}
              {!aiLoading&&suggestions.length===0&&<p style={{ fontSize:13, color:"#aaa" }}>Tap "Suggest for me" to get a personalized grocery list.</p>}
            </div>

            <div className="card" style={{ padding:16, marginBottom:14 }}>
              <p className="section-label">➕ Add Item</p>
              <div style={{ display:"flex", gap:8 }}>
                <input ref={itemInputRef} className="input" placeholder="e.g. whole milk, chicken breast..." value={itemInput} onChange={e=>setItemInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}/>
                <button onClick={addItem} style={{ background:"#2d5a1b", color:"#fff", border:"none", borderRadius:10, padding:"11px 18px", fontSize:20, cursor:"pointer", fontWeight:700 }}>+</button>
              </div>
            </div>

            {Object.entries(grouped).map(([cat,catItems])=>{
              const meta=CATEGORY_META[cat]||CATEGORY_META.Other;
              return (
                <div key={cat} className="card" style={{ marginBottom:12, overflow:"hidden" }}>
                  <div style={{ background:meta.bg, padding:"9px 16px", display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid "+meta.accent+"22" }}>
                    <span>{meta.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:meta.accent, textTransform:"uppercase", letterSpacing:"0.5px" }}>{cat}</span>
                    <span style={{ marginLeft:"auto", fontSize:1
)}
    </div>
  );
}
