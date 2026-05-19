import { useState, useEffect, useRef } from "react";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const SUPABASE_URL = "https://dmulrdxytfzyuftwwbrn.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdWxyZHh5dGZ6eXVmdHd3YnJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0NjIyMTcsImV4cCI6MjA5NDAzODIxN30.XY6X_DWr_Ygq-w2zngjWu5sBofrCTNaRgohgVYVXeD8";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = {
  Produce: ["apple","banana","orange","lettuce","spinach","tomato","potato","onion","garlic","carrot","broccoli","pepper","cucumber","avocado","lemon","lime","grape","strawberry","blueberry","mushroom","celery","zucchini","corn","pea","bean","herb","cilantro","parsley","ginger","sweet potato"],
  Dairy: ["milk","cheese","butter","yogurt","cream","egg","sour cream","cottage cheese","cream cheese","half and half","whipped cream","kefir","cheddar","mozzarella","parmesan","feta"],
  Meat: ["chicken","beef","pork","turkey","salmon","tuna","shrimp","bacon","sausage","lamb","steak","ground beef","hot dog","fish","cod","tilapia","ground turkey","ham","lobster"],
  Bakery: ["bread","bagel","muffin","croissant","roll","bun","tortilla","pita","wrap","cake","pie","donut","naan","baguette"],
  Pantry: ["rice","pasta","flour","sugar","salt","pepper","oil","vinegar","sauce","soup","canned","cereal","oat","coffee","tea","juice","water","soda","chip","cracker","cookie","chocolate","honey","jam","peanut butter","mustard","ketchup","mayo","soy sauce","coconut milk","broth","stock","olive oil","breadcrumb","panko","coca-cola","cola","pop"],
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

const MEAL_CATEGORY_META = {
  Breakfast: { icon: "🌅", color: "#d4870a", bg: "#fef3e2" },
  Lunch:     { icon: "☀️", color: "#3a6fd8", bg: "#e8f0fc" },
  Dinner:    { icon: "🌙", color: "#2d5a1b", bg: "#e8f5e0" },
  Snack:     { icon: "🍎", color: "#7b3fa8", bg: "#f2e8fc" },
  Dessert:   { icon: "🍰", color: "#c0392b", bg: "#fde8e8" },
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
  .nutrition-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:12px 0; }
  .nutrition-cell { background:#f7f4ef; border-radius:8px; padding:8px; text-align:center; }
  .nutrition-val { font-size:16px; font-weight:700; color:#2d5a1b; }
  .nutrition-lbl { font-size:10px; color:#7a7060; margin-top:2px; }
  .meal-cat-header { display:flex; align-items:center; gap:8px; padding:10px 0 8px; margin-top:8px; border-bottom:2px solid var(--border); margin-bottom:12px; }
  .wishlist-card { background:#fff; border-radius:14px; border:1px solid var(--border); box-shadow:var(--shadow); overflow:hidden; transition:all 0.2s; }
  .on-sale-badge { display:inline-block; background:#3d8c23; color:#fff; font-size:10px; font-weight:700; padding:2px 8px; border-radius:99px; margin-left:8px; }
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

async function callAI(system, prompt) {
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
  const [itemQty, setItemQty] = useState("1");
  const [checked, setChecked] = useState({});
  const [tab, setTab] = useState("list");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [selectedCombo, setSelectedCombo] = useState(0);
  const [saleItems, setSaleItems] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [weekSpend, setWeekSpend] = useState(null);
  const [history, setHistory] = useState([]);
  const [dishes, setDishes] = useState([]);
  const [dishesLoading, setDishesLoading] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [haveIngredients, setHaveIngredients] = useState({});
  const [dishError, setDishError] = useState("");
  const [dishDetailsLoading, setDishDetailsLoading] = useState(false);
  const [listId, setListId] = useState(null);
  const [activeMealCat, setActiveMealCat] = useState("All");
  // Receipt scan
  const [loadingStep, setLoadingStep] = useState(0); // 0=idle, 1=searching, 2=analyzing
  // Wishlist
  const [wishlist, setWishlist] = useState([]);
  const [wishlistInput, setWishlistInput] = useState("");
  const [wishlistTargetPrice, setWishlistTargetPrice] = useState("");
  const [wishlistChecking, setWishlistChecking] = useState(false);
  const [wishlistResults, setWishlistResults] = useState({});
  const [favouriteDishes, setFavouriteDishes] = useState([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editBudget, setEditBudget] = useState("");
  const [editPeople, setEditPeople] = useState(2);
  const [editMeals, setEditMeals] = useState([]);
  const [editCuisines, setEditCuisines] = useState([]);
  const [editPostal, setEditPostal] = useState("");
  const [editPostalIn, setEditPostalIn] = useState("");
  const [wishlistError, setWishlistError] = useState("");
  // Family
  const [household, setHousehold] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [pendingInvites, setPendingInvites] = useState([]);
  const [showFamily, setShowFamily] = useState(false);
  const itemInputRef = useRef(null);
  const saveTimer = useRef(null);
  const realtimeRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); loadProfile(session.user.id); }
      else { setTimeout(() => setScreen("login"), 1200); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setUser(session.user); loadProfile(session.user.id); }
      else { setUser(null); setProfile(null); setScreen("login"); if (realtimeRef.current) supabase.removeChannel(realtimeRef.current); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId) => {
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (prof) {
      setProfile(prof);
      setScreen("main");
      await loadGroceryList(userId);
      loadHistory(userId);
      loadHousehold(userId);
      checkPendingInvites(userId);
      loadWishlist(userId);
    } else {
      setScreen("onboard");
    }
  };

  const loadHousehold = async (userId) => {
    const { data: ownedRows } = await supabase.from("households").select("*").eq("owner_id", userId).limit(1);
    const owned = ownedRows?.[0];
    if (owned) { setHousehold(owned); loadHouseholdMembers(owned.id); subscribeToList(owned.id); return; }
    const { data: memberRows } = await supabase.from("household_members").select("*, households(*)").eq("user_id", userId).limit(1);
    const membership = memberRows?.[0];
    if (membership?.households) { setHousehold(membership.households); loadHouseholdMembers(membership.households.id); subscribeToList(membership.households.id); }
  };

  const loadHouseholdMembers = async (householdId) => {
    const { data } = await supabase.from("household_members").select("*, profiles(name)").eq("household_id", householdId);
    if (data) setHouseholdMembers(data);
  };

  const subscribeToList = (householdId) => {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    const channel = supabase.channel("list-" + householdId)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "grocery_lists" },
        (payload) => { if (payload.new?.items) setItems(payload.new.items); })
      .subscribe();
    realtimeRef.current = channel;
  };

  const checkPendingInvites = async (userId) => {
    const { data: authData } = await supabase.auth.getUser();
    const email = authData?.user?.email;
    if (!email) return;
    const { data } = await supabase.from("household_invites").select("*, households(name)").eq("invited_email", email.toLowerCase()).eq("status", "pending");
    if (data?.length > 0) setPendingInvites(data);
  };

  const createHousehold = async () => {
    if (!user || household) return;
    try {
      const name = (profile?.name || "My") + "'s Family";
      const { data: hh, error: hhErr } = await supabase.from("households").insert({ owner_id: user.id, name }).select().single();
      if (hhErr) { alert("Error: " + hhErr.message); return; }
      if (hh) {
        setHousehold(hh);
        if (listId) await supabase.from("grocery_lists").update({ household_id: hh.id }).eq("id", listId);
        else {
          const { data: newList } = await supabase.from("grocery_lists").insert({ user_id: user.id, household_id: hh.id, items: [] }).select().single();
          if (newList) setListId(newList.id);
        }
        subscribeToList(hh.id);
        alert("Family household created! Invite family members by email.");
      }
    } catch (err) { console.error(err); }
  };

  const inviteFamilyMember = async () => {
    if (!inviteEmail || !household) return;
    setInviteStatus("sending");
    const { error } = await supabase.from("household_invites").insert({ household_id: household.id, invited_email: inviteEmail.trim().toLowerCase(), invited_by: user.id });
    if (error) { setInviteStatus("error"); return; }
    setInviteStatus("sent");
    setInviteEmail("");
    setTimeout(() => setInviteStatus(""), 3000);
  };

  const acceptInvite = async (invite) => {
    await supabase.from("household_members").insert({ household_id: invite.household_id, user_id: user.id, role: "member" });
    await supabase.from("household_invites").update({ status: "accepted" }).eq("id", invite.id);
    setPendingInvites([]);
    // Load the shared household grocery list
    const { data: householdList } = await supabase.from("grocery_lists").select("*").eq("household_id", invite.household_id).single();
    if (householdList) {
      setListId(householdList.id);
      setItems(householdList.items || []);
      subscribeToList(invite.household_id);
    }
    // Load household info
    const { data: hh } = await supabase.from("households").select("*").eq("id", invite.household_id).single();
    if (hh) setHousehold(hh);
    loadHouseholdMembers(invite.household_id);
    alert("Welcome to " + (hh?.name || "the family household") + "! You now share the grocery list.");
  };

  const declineInvite = async (invite) => {
    await supabase.from("household_invites").update({ status: "declined" }).eq("id", invite.id);
    setPendingInvites(prev => prev.filter(i => i.id !== invite.id));
  };

  const loadGroceryList = async (userId) => {
    const { data: owned } = await supabase.from("households").select("id").eq("owner_id", userId).single();
    const { data: membership } = await supabase.from("household_members").select("household_id").eq("user_id", userId).single();
    const householdId = owned?.id || membership?.household_id;
    if (householdId) {
      const { data } = await supabase.from("grocery_lists").select("*").eq("household_id", householdId).single();
      if (data) { setListId(data.id); setItems(data.items || []); return; }
    }
    const { data } = await supabase.from("grocery_lists").select("*").eq("user_id", userId).single();
    if (data) { setListId(data.id); setItems(data.items || []); }
    else {
      const { data: newList } = await supabase.from("grocery_lists").insert({ user_id: userId, items: [] }).select().single();
      if (newList) setListId(newList.id);
    }
  };

  const loadHistory = async (userId) => {
    const { data } = await supabase.from("spending_history").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(12);
    if (data) setHistory(data);
  };

  const loadWishlist = async (userId) => {
    const { data } = await supabase.from("wishlist").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (data) setWishlist(data);
  };

  const toggleFavourite = (dish) => {
    setFavouriteDishes(prev => {
      const exists = prev.find(d => d.name === dish.name);
      if (exists) return prev.filter(d => d.name !== dish.name);
      return [{ ...dish, savedAt: new Date().toISOString() }, ...prev];
    });
  };

  const saveProfile = async () => {
    if (!user) return;
    const updated = { ...profile, budget: parseFloat(editBudget) || profile.budget, people: editPeople, meals: editMeals, cuisines: editCuisines, postal: editPostal || profile.postal };
    const { error } = await supabase.from("profiles").update(updated).eq("id", user.id);
    if (!error) { setProfile(updated); setEditingProfile(false); alert("Profile updated!"); }
  };

  const startEditProfile = () => {
    setEditBudget(String(profile?.budget || ""));
    setEditPeople(profile?.people || 2);
    setEditMeals(profile?.meals || []);
    setEditCuisines(profile?.cuisines || []);
    setEditPostalIn(profile?.postal || "");
    setEditPostal(profile?.postal || "");
    setEditingProfile(true);
  };

  const addToWishlist = async () => {
    if (!wishlistInput.trim() || !user) return;
    const item = { user_id: user.id, name: wishlistInput.trim(), target_price: parseFloat(wishlistTargetPrice) || null, on_sale: false };
    const { data } = await supabase.from("wishlist").insert(item).select().single();
    if (data) { setWishlist(prev => [data, ...prev]); setWishlistInput(""); setWishlistTargetPrice(""); }
  };

  const removeFromWishlist = async (id) => {
    await supabase.from("wishlist").delete().eq("id", id);
    setWishlist(prev => prev.filter(i => i.id !== id));
    const newResults = { ...wishlistResults };
    delete newResults[id];
    setWishlistResults(newResults);
  };

  const checkWishlistSales = async () => {
    if (!wishlist.length || !profile?.postal) return;
    setWishlistChecking(true); setWishlistError("");
    try {
      const newResults = {};
      for (const item of wishlist) {
        const res = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "wishlist",
            itemName: item.name,
            postal: profile.postal,
            targetPrice: item.target_price || null,
          }),
        });
        const data = await res.json();
        if (data.result) {
          const parsed = data.result;
          newResults[item.id] = parsed;
          // Mark as "on sale" if: AI says it's on sale, OR current price found AND below target price
          const hasPrice = parsed.currentPrice !== null && parsed.currentPrice > 0;
          const belowTarget = item.target_price && hasPrice && parsed.currentPrice <= item.target_price;
          const isOnSale = (parsed.onSale && hasPrice) || belowTarget;
          await supabase.from("wishlist").update({ current_price: parsed.currentPrice, on_sale: isOnSale, last_checked: new Date().toISOString() }).eq("id", item.id);
          setWishlist(prev => prev.map(w => w.id === item.id ? { ...w, current_price: parsed.currentPrice, on_sale: isOnSale, last_checked: new Date().toISOString() } : w));
        }
      }
      setWishlistResults(newResults);
    } catch (e) { setWishlistError("Could not check sales. Try again."); }
    finally { setWishlistChecking(false); }
  };

  const addWishlistItemToCart = (item) => {
    const updated = [...items, { id: Date.now() + Math.random(), name: item.name, category: categorize(item.name) }];
    setItems(updated); saveList(updated); setTab("list");
    alert(item.name + " added to your grocery list!");
  };

  const saveList = async (newItems) => {
    if (!listId) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("grocery_lists").update({ items: newItems, updated_at: new Date().toISOString() }).eq("id", listId);
    }, 500);
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
    if (data.user) { setUser(data.user); setScreen("onboard"); }
  };

  const handleLogout = async () => {
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
    await supabase.auth.signOut();
    setItems([]); setResults(null); setHistory([]); setProfile(null); setHousehold(null); setHouseholdMembers([]); setWishlist([]);
  };

  const saveOnboarding = async () => {
    const prof = { id: user.id, name: authName || user.email.split("@")[0], budget: parseFloat(obBudget), people: obPeople, meals: obMeals, cuisines: obCuisines, postal: obPostal };
    const { error } = await supabase.from("profiles").upsert(prof);
    if (!error) {
      setProfile(prof);
      const { data: newList } = await supabase.from("grocery_lists").insert({ user_id: user.id, items: [] }).select().single();
      if (newList) setListId(newList.id);
      setScreen("main");
      loadHousehold(user.id);
      checkPendingInvites(user.id);
    }
  };

  const suggestGroceries = async () => {
    if (!profile) return;
    setAiLoading(true); setSuggestions([]); setError("");
    try {
      const cuisines = (profile.cuisines||[]).length > 0 ? (profile.cuisines||[]).join(", ") : "Canadian";
      const system = "You are a meal planning assistant. Return ONLY a JSON array of grocery item name strings. No markdown, no explanation, no code blocks.";
      const prompt = "Suggest a weekly grocery list for " + (profile.people||2) + " people who enjoy " + cuisines + " cuisine. Budget $" + (profile.budget||200) + " CAD/week. Return ONLY a JSON array like: [\"milk\", \"bread\", \"chicken breast\", \"apples\"]";
      const text = await callAI(system, prompt);
      if (!text || text.trim() === "") throw new Error("Empty response");
      const clean = text.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const match = clean.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) setSuggestions(parsed);
      }
    } catch (e) { console.error("suggestGroceries:", e.message); setError("Could not get suggestions. Please try again."); }
    finally { setAiLoading(false); }
  };

  const loadDishes = async () => {
    if (!profile) return;
    setDishesLoading(true); setDishError(""); setDishes([]); setSelectedDish(null);
    try {
      const cuisines = (profile.cuisines||[]).length > 0 ? (profile.cuisines||[]).join(", ") : "Canadian";
      const system = "You are a professional chef. Return ONLY a valid JSON array. No markdown, no code blocks, no explanation.";
      const prompt = "Suggest 8 dishes for " + (profile.people||2) + " people who enjoy " + cuisines + " cuisine. Include at least one Breakfast, Lunch, Dinner, Snack, Dessert. Return ONLY a JSON array with exactly 8 items, each with these fields only: [{name,emoji,mealCategory,cuisine,prepTime,cookTime,difficulty,costPerPersonCAD,description}]";
      const text = await callAI(system, prompt);
      if (!text || text.trim() === "") throw new Error("Empty AI response");
      const clean = text.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const arrayMatch = clean.match(/\[[\s\S]*\]/);
      if (!arrayMatch) throw new Error("No JSON array in response");
      const parsed = JSON.parse(arrayMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty array");
      setDishes(parsed);
    } catch (e) {
      console.error("loadDishes:", e.message);
      setDishError("Could not load dish suggestions. Please try again.");
    }
    finally { setDishesLoading(false); }
  };

  const loadDishDetails = async (dish) => {
    if (dish.steps && dish.steps.length > 0) return dish;
    try {
      const people = profile?.people || 2;
      const system = "You are a chef. Return ONLY a valid JSON object. No markdown, no backticks, no extra text.";
      const prompt = 'Full recipe for "' + dish.name + '" for ' + people + ' people. Return ONLY this JSON: {"nutrition":{"calories":"450 kcal","protein":"35g","carbs":"20g","fat":"15g"},"tips":["tip one","tip two"],"ingredients":[{"name":"pork ribs","amount":"1","unit":"kg","notes":"baby back"},{"name":"BBQ sauce","amount":"200","unit":"ml","notes":""}],"steps":[{"title":"Season the ribs","detail":"Rub ribs with salt, pepper and garlic powder. Let sit for 30 minutes."},{"title":"Slow cook","detail":"Bake at 300F for 2.5 hours covered in foil."}]} Fill in real values for ' + dish.name + '. Include ALL ingredients and 5-8 detailed steps.';
      const text = await callAI(system, prompt);
      if (!text) { console.error("loadDishDetails: empty response"); return dish; }
      const clean = text.replace(/```json|```/g, "").replace(/[\r\n]+/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) { console.error("loadDishDetails: no JSON found"); return dish; }
      const details = JSON.parse(match[0]);
      return { ...dish, ...details };
    } catch(e) {
      console.error("loadDishDetails error:", e.message);
      return dish;
    }
  };

  const openDish = async (dish) => {
    setSelectedDish(dish); // show immediately with basic info
    setScreen("dishDetail");
    setDishDetailsLoading(true);
    // Load full details (nutrition, ingredients, steps) in background
    const full = await loadDishDetails(dish);
    setSelectedDish(full);
    setDishDetailsLoading(false);
    // Auto-check ingredients already on the grocery list
    const autoChecked = {};
    if (full.ingredients) {
      full.ingredients.forEach((ing, idx) => {
        const ingName = ing.name.toLowerCase();
        const alreadyOnList = items.some(item => {
          const itemName = item.name.toLowerCase();
          return itemName.includes(ingName) || ingName.includes(itemName.split(" ")[0]);
        });
        if (alreadyOnList) autoChecked[idx] = true;
      });
    }
    setHaveIngredients(autoChecked);
  };

  const addMissingToList = () => {
    if (!selectedDish) return;
    const missing = selectedDish.ingredients.filter((_, idx) => !haveIngredients[idx]);
    const newItems = missing.map(ing => {
      // Keep count quantities (numbers) but strip measurement units (cups, tbsp, tsp, lb, kg, oz etc)
      const isMeasured = ing.unit && /^(cups?|tbsp|tsp|tablespoons?|teaspoons?|pounds?|lbs?|kg|g|oz|ml|l|liters?|litres?|cloves?|slices?|sheets?|pinch|dash)$/i.test(ing.unit);
      // If it is a count unit (pieces, medium, large, whole) or no unit — keep the number
      const isCount = !ing.unit || /^(x|pcs?|pieces?|medium|large|small|whole|rounds?|cans?|boxes?|bags?|bunches?|heads?|stalks?)$/i.test(ing.unit);
      let name;
      if (isMeasured) {
        // Strip the measurement — just use the ingredient name
        name = ing.name;
      } else if (isCount && ing.amount && ing.amount !== "1") {
        // Keep the number for countable items (e.g. "8 apples", "2 pie crusts")
        name = ing.amount + " " + (ing.unit ? ing.unit + " " : "") + ing.name;
      } else {
        name = ing.name;
      }
      return { id: Date.now() + Math.random(), name: name.trim(), category: categorize(ing.name) };
    });
    const updated = [...items];
    newItems.forEach(ni => {
      // Check for duplicates by ingredient name (not full string) to avoid adding milk twice
      const ingName = ni.name.toLowerCase().replace(/^\d+\s*(x\s*)?/, "").trim();
      const alreadyExists = updated.find(i => {
        const existingName = i.name.toLowerCase().replace(/^\d+\s*(x\s*)?/, "").trim();
        return existingName === ingName || existingName.includes(ingName) || ingName.includes(existingName);
      });
      if (!alreadyExists) updated.push(ni);
    });
    setItems(updated); saveList(updated);
    setSelectedDish(null); setHaveIngredients({}); setTab("list");
    alert(missing.length + " ingredient" + (missing.length !== 1 ? "s" : "") + " added to your grocery list!");
  };

  const addSuggestion = (s) => {
    if (items.find(i => i.name.toLowerCase() === s.toLowerCase())) return;
    const updated = [...items, { id: Date.now() + Math.random(), name: s, category: categorize(s) }];
    setItems(updated); saveList(updated);
  };

  const addItem = () => {
    const t = itemInput.trim(); if (!t) return;
    const qty = parseInt(itemQty) || 1;
    const name = qty > 1 ? qty + "x " + t : t;
    const memberName = profile?.name?.split(" ")[0] || "You";
    const updated = [...items, { id: Date.now(), name, category: categorize(t), qty, addedBy: memberName }];
    setItems(updated); saveList(updated);
    setItemInput(""); setItemQty("1");
    if (itemInputRef.current) itemInputRef.current.focus();
  };

  const removeItem = (id) => {
    const updated = items.filter(i => i.id !== id);
    setItems(updated); saveList(updated);
  };

  const toggleCheck = (id) => {
    const memberName = profile?.name?.split(" ")[0] || "You";
    setChecked(p => {
      const nowChecked = !p[id];
      return { ...p, [id]: nowChecked };
    });
    setItems(prev => prev.map(item => item.id === id
      ? { ...item, crossedBy: !checked[id] ? memberName : null }
      : item
    ));
  };

  const findPrices = async () => {
    if (items.length === 0) { setError("Add items to your list first!"); return; }
    let postal = profile?.postal;
    if (!postal && household) {
      const { data: ownerProfile } = await supabase.from("profiles").select("postal,budget").eq("id", household.owner_id).single();
      if (ownerProfile?.postal) postal = ownerProfile.postal;
    }
    if (!postal) { setError("No postal code found. Please update your profile."); return; }
    setError(""); setLoading(true); setResults(null); setSelectedCombo(0);
    const budget = profile?.budget || 200;
    try {
      // CALL 1: Search the web for prices across all stores simultaneously
      setLoadingStep(1);
      const searchRes = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "search", items: items.map(i => i.name), postal, budget, cuisines: profile?.cuisines || [] }),
      });
      const searchData = await searchRes.json();
      if (searchData.error) throw new Error(searchData.error);

      // CALL 2: AI analyzes search results and extracts prices
      setLoadingStep(2);
      const analyzeRes = await fetch("/api/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "analyze", searchResults: searchData, postal, budget }),
      });
      const analyzeData = await analyzeRes.json();

      // If analyze fails, fall back to combined single-call mode
      let raw;
      if (analyzeData.error || !analyzeData.text) {
        const combinedRes = await fetch("/api/prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "prices", items: items.map(i => i.name), postal, budget, cuisines: profile?.cuisines || [] }),
        });
        const combinedData = await combinedRes.json();
        if (combinedData.error) throw new Error(combinedData.error);
        raw = combinedData.text || "";
      } else {
        raw = analyzeData.text || "";
      }

      const clean = raw.replace(/```json|```/g, "").replace(/\n/g, " ").trim();
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("parse fail");
      const parsed = JSON.parse(match[0]);
      parsed.budgetCAD = parsed.budgetCAD || budget;
      setResults(parsed);
      setSaleItems(parsed.saleItems || []);
      setWeekSpend(parsed.combinations?.[0]?.totalCAD || 0);
      setError("");
      setLoadingStep(0);
      setTab("compare");
    } catch (e) { setError("Could not fetch prices. Please try again."); setLoadingStep(0); }
    finally { setLoading(false); }
  };

  const saveWeek = async () => {
    if (!results || !user) return;
    const chosen = results.combinations?.[selectedCombo] || results.combinations?.[0];
    const week = { user_id: user.id, date: new Date().toISOString().split("T")[0], spent: chosen?.totalCAD || 0, store: chosen?.label || "", budget: profile?.budget || 0, items: items.map(i => i.name) };
    const { error } = await supabase.from("spending_history").insert(week);
    if (!error) { loadHistory(user.id); alert("Week saved! Strategy: " + chosen?.label); }
  };

  const grouped = items.reduce((acc, item) => { (acc[item.category] = acc[item.category] || []).push(item); return acc; }, {});
  const budget = profile?.budget || 0;
  const avgSpend = history.length ? (history.reduce((s, w) => s + (w.spent || 0), 0) / history.length).toFixed(2) : null;
  const spentPct = weekSpend && budget ? Math.min((weekSpend / budget) * 100, 100) : 0;
  const overBudget = weekSpend && budget && weekSpend > budget;
  const mealCategories = ["All", "Breakfast", "Lunch", "Dinner", "Snack", "Dessert"];
  const filteredDishes = activeMealCat === "All" ? dishes : dishes.filter(d => d.mealCategory === activeMealCat);
  const dishesByCategory = filteredDishes.reduce((acc, dish) => { const cat = dish.mealCategory || "Dinner"; acc[cat] = acc[cat] || []; acc[cat].push(dish); return acc; }, {});

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
          <div className="card" style={{ padding:28, paddingBottom:48 }}>
            <p style={{ fontSize:13, color:"#7a7060", marginBottom:4 }}>Step {obStep+1} of {steps.length}</p>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, color:"#2d5a1b", marginBottom:4 }}>{s.title}</h2>
            <p style={{ fontSize:14, color:"#7a7060", marginBottom:24 }}>{s.subtitle}</p>
            {obStep===0&&(<div style={{ position:"relative" }}><span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7a7060" }}>$</span><input className="input" style={{ paddingLeft:28 }} type="number" placeholder="e.g. 200" value={obBudget} onChange={e=>setObBudget(e.target.value)}/><p style={{ fontSize:12, color:"#aaa", marginTop:6 }}>Per week, in Canadian dollars</p></div>)}
            {obStep===1&&(<div style={{ display:"flex", alignItems:"center", gap:16, justifyContent:"center", padding:"8px 0" }}><button className="btn-ghost" style={{ fontSize:22, padding:"10px 18px" }} onClick={()=>setObPeople(Math.max(1,obPeople-1))}>-</button><div style={{ textAlign:"center" }}><div style={{ fontSize:40, fontFamily:"'DM Serif Display',serif", color:"#2d5a1b" }}>{obPeople}</div><div style={{ fontSize:13, color:"#7a7060" }}>people</div></div><button className="btn-ghost" style={{ fontSize:22, padding:"10px 18px" }} onClick={()=>setObPeople(Math.min(12,obPeople+1))}>+</button></div>)}
            {obStep===2&&(<div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{MEAL_TYPES.map(m=><span key={m} className={"pill "+(obMeals.includes(m)?"selected":"unselected")} onClick={()=>setObMeals(p=>p.includes(m)?p.filter(x=>x!==m):[...p,m])}>{m}</span>)}</div>)}
            {obStep===3&&(<div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{CUISINE_OPTIONS.map(c=><span key={c} className={"pill "+(obCuisines.includes(c)?"selected":"unselected")} onClick={()=>setObCuisines(p=>p.includes(c)?p.filter(x=>x!==c):[...p,c])}>{c}</span>)}</div>)}
            {obStep===4&&(<div><input className="input" placeholder="e.g. M5V 3A8" value={obPostalIn} maxLength={7} onChange={e=>{const f=formatPostalCode(e.target.value);setObPostalIn(f);if(isValidPostal(f))setObPostal(f);else setObPostal("");}} onFocus={e=>setTimeout(()=>e.target.scrollIntoView({behavior:"smooth",block:"center"}),400)} style={{ textTransform:"uppercase", letterSpacing:"1px", fontSize:18 }}/><p style={{ fontSize:12, color:"#aaa", marginTop:6 }}>Canadian postal code: A1A 1A1</p>{isValidPostal(obPostal)&&<p style={{ fontSize:13, color:"#3d8c23", marginTop:6 }}>✓ Valid postal code — tap "Let's go!" below</p>}</div>)}
            <div style={{ display:"flex", gap:10, marginTop:28 }}>
              {obStep>0&&<button className="btn-ghost" style={{ flex:1 }} onClick={()=>setObStep(s=>s-1)}>Back</button>}
              <button className="btn-primary" style={{ flex:2, padding:"16px 24px", fontSize:16, minHeight:52 }} disabled={!canNext} onClick={()=>{if(obStep<steps.length-1)setObStep(s=>s+1);else saveOnboarding();}}>{obStep===steps.length-1?"🚀 Let's go!":"Continue"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f7f4ef", fontFamily:"'DM Sans',sans-serif", color:"#1a1a1a" }}>
      <style>{css}</style>

      {/* Pending invites banner */}
      {pendingInvites.length > 0 && pendingInvites.map(invite => (
        <div key={invite.id} style={{ background:"#2d5a1b", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
          <p style={{ color:"#e8f5e0", fontSize:13 }}>👨‍👩‍👧 You've been invited to join <strong>{invite.households?.name || "a family"}</strong></p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>acceptInvite(invite)} style={{ background:"#e8f5e0", color:"#2d5a1b", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Accept</button>
            <button onClick={()=>declineInvite(invite)} style={{ background:"none", border:"1px solid #4a7a30", borderRadius:8, padding:"6px 14px", fontSize:12, color:"#8fa87a", cursor:"pointer" }}>Decline</button>
          </div>
        </div>
      ))}

      {/* FAMILY MODAL */}
      {showFamily && (
        <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)" }} onClick={e => e.target === e.currentTarget && setShowFamily(false)}>
          <div className="fade-in" style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:640, boxShadow:"0 -8px 40px rgba(0,0,0,0.25)", maxHeight:"80vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#2d5a1b", margin:0 }}>👨‍👩‍👧 Family Sharing</h2>
                <p style={{ fontSize:13, color:"#7a7060", margin:"2px 0 0" }}>Share your grocery list in real time</p>
              </div>
              <button onClick={() => setShowFamily(false)} style={{ background:"#f0f0f0", border:"none", borderRadius:99, width:32, height:32, fontSize:18, cursor:"pointer" }}>×</button>
            </div>
            {!household ? (
              <div>
                <div style={{ background:"#e8f5e0", borderRadius:14, padding:20, marginBottom:16, textAlign:"center" }}>
                  <div style={{ fontSize:48, marginBottom:8 }}>🏠</div>
                  <p style={{ fontSize:15, fontWeight:600, color:"#2d5a1b", marginBottom:6 }}>Create your family household</p>
                  <p style={{ fontSize:13, color:"#7a7060", marginBottom:16 }}>Invite family members to share and sync your grocery list instantly.</p>
                  <button onClick={createHousehold} className="btn-primary" style={{ width:"100%" }}>Create Family Household</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ background:"#e8f5e0", borderRadius:12, padding:14, marginBottom:16, display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:32 }}>🏠</span>
                  <div>
                    <p style={{ fontSize:15, fontWeight:700, color:"#2d5a1b", margin:0 }}>{household.name}</p>
                    <p style={{ fontSize:12, color:"#5a8a40", margin:0 }}>📡 List syncs in real time for all members</p>
                  </div>
                </div>
                {householdMembers.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <p style={{ fontSize:12, fontWeight:600, color:"#7a7060", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Members ({householdMembers.length})</p>
                    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                      {/* Owner */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderRadius:12, background:"#e8f5e0", border:"1px solid #b8dba0" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:18 }}>👑</span>
                          <div>
                            <p style={{ fontSize:14, fontWeight:700, color:"#2d5a1b", margin:0 }}>{profile?.name || "You"}</p>
                            <p style={{ fontSize:11, color:"#5a8a40", margin:0 }}>Owner</p>
                          </div>
                        </div>
                      </div>
                      {/* Members */}
                      {householdMembers.map((m, i) => (
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderRadius:12, background:"#f7f4ef", border:"1px solid #e2dbd0" }}>
                          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                            <span style={{ fontSize:18 }}>👤</span>
                            <div>
                              <p style={{ fontSize:14, fontWeight:600, color:"#1a1a1a", margin:0 }}>{m.profiles?.name || "Member"}</p>
                              <p style={{ fontSize:11, color:"#aaa", margin:0 }}>Member</p>
                            </div>
                          </div>
                          {/* Only owner can remove */}
                          {household?.owner_id === user?.id && (
                            <button onClick={async () => {
                              if (window.confirm("Remove " + (m.profiles?.name || "this member") + " from the family?")) {
                                await supabase.from("household_members").delete().eq("id", m.id);
                                loadHouseholdMembers(household.id);
                              }
                            }} style={{ background:"none", border:"1px solid #f5c0c0", borderRadius:8, padding:"4px 10px", fontSize:11, color:"#c0392b", cursor:"pointer" }}>Remove</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p style={{ fontSize:12, fontWeight:600, color:"#7a7060", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Invite Family Member</p>
                <div style={{ display:"flex", gap:8, marginBottom:8 }}>
                  <input className="input" placeholder="Enter family member's email..." value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && inviteFamilyMember()} />
                  <button onClick={inviteFamilyMember} disabled={!inviteEmail} className="btn-primary" style={{ whiteSpace:"nowrap", padding:"11px 16px" }}>Invite</button>
                </div>
                {inviteStatus === "sent" && <div style={{ background:"#e8f5e0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#2d5a1b", fontWeight:600 }}>✅ Invite sent! They'll see it when they log in.</div>}
                {inviteStatus === "error" && <div style={{ background:"#fde8e8", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#c0392b" }}>❌ Failed to send. Try again.</div>}
              </div>
            )}
            <button onClick={() => setShowFamily(false)} style={{ width:"100%", marginTop:20, background:"#f7f4ef", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:600, color:"#7a7060", cursor:"pointer" }}>Close</button>
          </div>
        </div>
      )}

      <div style={{ background:"#2d5a1b", padding:"20px 20px 0", position:"sticky", top:0, zIndex:20, boxShadow:"0 2px 12px rgba(0,0,0,0.18)" }}>
        <div style={{ maxWidth:640, margin:"0 auto" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#e8f5e0", margin:0 }}>🛒 MyGroceryWeek</h1>
              <p style={{ fontSize:12, color:"#8fa87a", margin:0 }}>Hi {profile?.name?.split(" ")[0] || ""} - {profile?.postal || ""} {household ? "👨‍👩‍👧 " + household.name : ""}</p>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {results && <button onClick={saveWeek} style={{ background:"#e8f5e0", color:"#2d5a1b", border:"none", borderRadius:8, padding:"7px 12px", fontSize:12, fontWeight:600, cursor:"pointer" }}>💾 Save Week</button>}
              <button onClick={startEditProfile} style={{ background:"none", border:"1px solid #4a7a30", borderRadius:8, padding:"7px 12px", fontSize:12, color:"#8fa87a", cursor:"pointer" }} title="Edit profile">⚙️</button>
              <button onClick={() => setShowFamily(f => !f)} style={{ position:"relative", background:showFamily?"#e8f5e0":"none", border:"1px solid #4a7a30", borderRadius:8, padding:"7px 12px", fontSize:12, color:showFamily?"#2d5a1b":"#8fa87a", cursor:"pointer" }}>
                👨‍👩‍👧
                {householdMembers.length > 0 && <span style={{ position:"absolute", top:-4, right:-4, background:"#3d8c23", color:"#fff", borderRadius:99, fontSize:9, padding:"1px 5px", fontWeight:700 }}>{householdMembers.length}</span>}
              </button>
              <button onClick={handleLogout} style={{ background:"none", border:"1px solid #4a7a30", borderRadius:8, padding:"7px 12px", fontSize:12, color:"#8fa87a", cursor:"pointer" }}>Sign out</button>
            </div>
          </div>
          {budget > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#8fa87a", marginBottom:4 }}>
                <span>{overBudget ? "Over budget!" : "Budget: $" + budget + " CAD/week"}</span>
                {weekSpend && <span style={{ color:overBudget?"#ff9a8a":"#a8d878", fontWeight:600 }}>${weekSpend.toFixed(2)} spent</span>}
              </div>
              <div className="budget-bar-wrap"><div className="budget-bar" style={{ width:spentPct + "%", background:overBudget?"#c0392b":spentPct>80?"#d4870a":"#3d8c23" }} /></div>
            </div>
          )}
          <div style={{ display:"flex", overflowX:"auto" }}>
            {[["list","📋 List" + (items.length ? " ("+items.length+")" : "")],["meals","🍽️ Meals"],["compare","📊 Compare"],["wishlist","⭐ Wishlist"],["history","📈 History"],["family","👨‍👩‍👧 Family" + (householdMembers.length > 0 ? " ("+householdMembers.length+")" : "")]].map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)} style={{ flex:"0 0 auto", background:"none", border:"none", padding:"10px 14px", fontSize:12, fontWeight:600, color:tab===t?"#e8f5e0":"#6a8a5a", borderBottom:tab===t?"2px solid #e8f5e0":"2px solid transparent", cursor:"pointer", transition:"all 0.18s", whiteSpace:"nowrap" }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* EDIT PROFILE MODAL */}
      {editingProfile && (
        <div style={{ position:"fixed", inset:0, zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.5)" }} onClick={e => e.target === e.currentTarget && setEditingProfile(false)}>
          <div className="fade-in" style={{ background:"#fff", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:640, boxShadow:"0 -8px 40px rgba(0,0,0,0.25)", maxHeight:"85vh", overflowY:"auto" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#2d5a1b", margin:0 }}>⚙️ Edit Preferences</h2>
              <button onClick={() => setEditingProfile(false)} style={{ background:"#f0f0f0", border:"none", borderRadius:99, width:32, height:32, fontSize:18, cursor:"pointer" }}>×</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div>
                <p className="section-label">Weekly Budget (CAD)</p>
                <div style={{ position:"relative" }}><span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:"#7a7060" }}>$</span><input className="input" style={{ paddingLeft:28 }} type="number" value={editBudget} onChange={e => setEditBudget(e.target.value)} placeholder="e.g. 300" /></div>
              </div>
              <div>
                <p className="section-label">Number of People</p>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <button className="btn-ghost" style={{ padding:"8px 16px" }} onClick={() => setEditPeople(Math.max(1, editPeople-1))}>−</button>
                  <span style={{ fontSize:20, fontWeight:700, color:"#2d5a1b", minWidth:30, textAlign:"center" }}>{editPeople}</span>
                  <button className="btn-ghost" style={{ padding:"8px 16px" }} onClick={() => setEditPeople(Math.min(12, editPeople+1))}>+</button>
                </div>
              </div>
              <div>
                <p className="section-label">Meal Types</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{MEAL_TYPES.map(m => <span key={m} className={"pill " + (editMeals.includes(m) ? "selected" : "unselected")} onClick={() => setEditMeals(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m])}>{m}</span>)}</div>
              </div>
              <div>
                <p className="section-label">Cuisine Preferences</p>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>{CUISINE_OPTIONS.map(c => <span key={c} className={"pill " + (editCuisines.includes(c) ? "selected" : "unselected")} onClick={() => setEditCuisines(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}>{c}</span>)}</div>
              </div>
              <div>
                <p className="section-label">Postal Code</p>
                <input className="input" placeholder="e.g. M5V 3A8" value={editPostalIn} maxLength={7} onChange={e => { const f = formatPostalCode(e.target.value); setEditPostalIn(f); if (isValidPostal(f)) setEditPostal(f); else setEditPostal(""); }} style={{ textTransform:"uppercase", letterSpacing:"1px" }} />
                {isValidPostal(editPostal) && <p style={{ fontSize:13, color:"#3d8c23", marginTop:4 }}>✓ Valid</p>}
              </div>
            </div>
            <button onClick={saveProfile} className="btn-primary" style={{ width:"100%", marginTop:20 }}>Save Changes</button>
            <button onClick={() => setEditingProfile(false)} style={{ width:"100%", marginTop:10, background:"#f7f4ef", border:"none", borderRadius:12, padding:14, fontSize:14, fontWeight:600, color:"#7a7060", cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ maxWidth:640, margin:"0 auto", padding:"20px 16px 48px" }} className="fade-in">

        {/* LIST TAB */}
        {tab === "list" && (
          <div>
            <div className="card" style={{ padding:16, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <p className="section-label" style={{ margin:0 }}>✨ AI Suggestions</p>
                <button onClick={suggestGroceries} disabled={aiLoading} style={{ background:"#e8f5e0", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:600, color:"#2d5a1b", cursor:"pointer" }}>
                  {aiLoading ? "Loading..." : suggestions.length ? "Refresh" : "Suggest for me"}
                </button>
              </div>
              {aiLoading && <p style={{ fontSize:13, color:"#aaa", fontStyle:"italic" }}>Generating suggestions...</p>}
              {suggestions.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {suggestions.map((s, i) => {
                    const already = items.find(it => it.name.toLowerCase() === s.toLowerCase());
                    return <span key={i} onClick={() => !already && addSuggestion(s)} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 11px", borderRadius:99, fontSize:13, cursor:already?"default":"pointer", background:already?"#f0f0f0":"#fff", color:already?"#bbb":"#2d5a1b", border:"1.5px solid "+(already?"#e0e0e0":"#b8dba0"), fontWeight:500 }}>{already ? "Added" : "+"} {s}</span>;
                  })}
                </div>
              )}
              {!aiLoading && suggestions.length === 0 && <p style={{ fontSize:13, color:"#aaa" }}>Tap "Suggest for me" to get a personalized grocery list.</p>}
            </div>

            <div className="card" style={{ padding:16, marginBottom:14 }}>
              <p className="section-label">➕ Add Item</p>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <input ref={itemInputRef} className="input" placeholder="e.g. whole milk, chicken breast..." value={itemInput} onChange={e => setItemInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} />
                <button onClick={addItem} style={{ background:"#2d5a1b", color:"#fff", border:"none", borderRadius:10, padding:"11px 18px", fontSize:20, cursor:"pointer", fontWeight:700 }}>+</button>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:13, color:"#7a7060" }}>Qty:</span>
                <button onClick={() => setItemQty(q => String(Math.max(1, parseInt(q)||1) - 1))} style={{ background:"#f0f0f0", border:"none", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontWeight:700, fontSize:16 }}>−</button>
                <span style={{ fontSize:15, fontWeight:700, minWidth:24, textAlign:"center" }}>{itemQty}</span>
                <button onClick={() => setItemQty(q => String((parseInt(q)||1) + 1))} style={{ background:"#f0f0f0", border:"none", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontWeight:700, fontSize:16 }}>+</button>
                <span style={{ fontSize:12, color:"#bbb" }}>e.g. 2x apple juice</span>
              </div>
            </div>

            {Object.entries(grouped).map(([cat, catItems]) => {
              const meta = CATEGORY_META[cat] || CATEGORY_META.Other;
              return (
                <div key={cat} className="card" style={{ marginBottom:12, overflow:"hidden" }}>
                  <div style={{ background:meta.bg, padding:"9px 16px", display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid "+meta.accent+"22" }}>
                    <span>{meta.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:meta.accent, textTransform:"uppercase", letterSpacing:"0.5px" }}>{cat}</span>
                    <span style={{ marginLeft:"auto", fontSize:12, color:meta.accent, fontWeight:600 }}>{catItems.length}</span>
                  </div>
                  {catItems.map(item => (
                    <div key={item.id} style={{ display:"flex", alignItems:"center", padding:"11px 16px", borderBottom:"1px solid #f5f0e8", gap:12 }}>
                      <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggleCheck(item.id)} style={{ width:17, height:17, accentColor:meta.accent, cursor:"pointer", flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:15, textDecoration:checked[item.id]?"line-through":"none", color:checked[item.id]?"#bbb":"#1a1a1a" }}>{item.name}</span>
                        <div style={{ display:"flex", gap:8, marginTop:2 }}>
                          {item.addedBy && <span style={{ fontSize:11, color:"#aaa" }}>Added by <span style={{ textDecoration:"none", color:"#7a7060" }}>{item.addedBy}</span></span>}
                          {item.crossedBy && checked[item.id] && <span style={{ fontSize:11, color:"#aaa" }}>· Crossed by <span style={{ textDecoration:"line-through", color:"#bbb" }}>{item.crossedBy}</span></span>}
                        </div>
                      </div>
                      <button onClick={() => removeItem(item.id)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:15, color:"#ccc", padding:"2px 6px" }}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}

            {items.length === 0 && (
              <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🛍️</div>
                <p style={{ fontStyle:"italic", fontSize:15 }}>Your list is empty. Use suggestions or add items above.</p>
                <button onClick={() => setTab("meals")} className="btn-ghost" style={{ marginTop:16 }}>Browse Meal Ideas 🍽️</button>
              </div>
            )}

            {items.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:8 }}>
                {loading && (
                  <div style={{ background:"#fff", border:"1px solid #e2dbd0", borderRadius:12, padding:16, marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{ fontSize:13, fontWeight:600, color:"#2d5a1b" }}>
                        {loadingStep === 1 ? "🔍 Searching stores..." : "🧠 Analyzing prices..."}
                      </span>
                      <span style={{ fontSize:12, color:"#aaa" }}>{loadingStep === 1 ? "Step 1 of 2" : "Step 2 of 2"}</span>
                    </div>
                    <div style={{ height:8, background:"#f0ebe0", borderRadius:99, overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:99, background:"#3d8c23", transition:"width 0.5s ease", width: loadingStep === 1 ? "45%" : "90%" }} />
                    </div>
                    <p style={{ fontSize:12, color:"#7a7060", marginTop:8, margin:"8px 0 0" }}>
                      {loadingStep === 1
                        ? "Searching Walmart, Loblaws, No Frills, Costco, Metro, Sobeys, FreshCo, Food Basics..."
                        : "AI is reading search results and finding the best prices for each item..."}
                    </p>
                  </div>
                )}
                <button onClick={findPrices} disabled={loading} className="btn-primary" style={{ width:"100%", padding:16, fontSize:16 }}>
                  {loading ? (loadingStep === 2 ? "🧠 Analyzing prices..." : "🔍 Searching 10+ stores...") : "🔍 Find Best Prices and Compare Stores"}
                </button>

                <button onClick={() => { const u=[]; setItems(u); saveList(u); setResults(null); setChecked({}); setSuggestions([]); setWeekSpend(null); }} style={{ background:"none", border:"1.5px solid #f5c0c0", borderRadius:10, padding:12, fontSize:13, color:"#c0392b", cursor:"pointer" }}>🗑 Clear List</button>
              </div>
            )}
            {error && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:10, padding:"12px 16px", marginTop:12, color:"#c0392b", fontSize:14 }}>⚠️ {error}</div>}
          </div>
        )}

        {/* MEALS TAB */}
        {tab === "meals" && (
          <div>
            {selectedDish ? (
              <div className="fade-in">
                <button onClick={() => { setSelectedDish(null); setHaveIngredients({}); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#2d5a1b", fontSize:14, fontWeight:600, marginBottom:16, display:"flex", alignItems:"center", gap:6 }}>← Back to dishes</button>
                <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
                  <div style={{ fontSize:64, display:"flex", alignItems:"center", justifyContent:"center", padding:24, background:"linear-gradient(135deg,#f7f4ef,#e8f5e0)" }}>{selectedDish.emoji}</div>
                  <div style={{ padding:20 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                      <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#2d5a1b" }}>{selectedDish.name}</h2>
                      <span style={{ fontSize:12, fontWeight:600, color:DIFFICULTY_COLOR[selectedDish.difficulty]||"#666", background:"#f7f4ef", padding:"3px 10px", borderRadius:99, flexShrink:0, marginLeft:8 }}>{selectedDish.difficulty}</span>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
                      {selectedDish.mealCategory && <span style={{ fontSize:11, fontWeight:600, padding:"2px 10px", borderRadius:99, background:(MEAL_CATEGORY_META[selectedDish.mealCategory]||{}).bg||"#f0f0f0", color:(MEAL_CATEGORY_META[selectedDish.mealCategory]||{}).color||"#666" }}>{(MEAL_CATEGORY_META[selectedDish.mealCategory]||{}).icon} {selectedDish.mealCategory}</span>}
                      <span style={{ fontSize:11, padding:"2px 10px", borderRadius:99, background:"#f0f8ea", color:"#3d8c23", fontWeight:600 }}>{selectedDish.cuisine}</span>
                    </div>
                    <p style={{ fontSize:14, color:"#7a7060", marginBottom:14 }}>{selectedDish.description}</p>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:14 }}>
                      <div style={{ background:"#f7f4ef", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ fontSize:18 }}>⏱</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#2d5a1b" }}>{selectedDish.totalTime||selectedDish.cookTime}</div>
                        <div style={{ fontSize:10, color:"#aaa" }}>Total Time</div>
                      </div>
                      <div style={{ background:"#f7f4ef", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ fontSize:18 }}>👥</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#2d5a1b" }}>{selectedDish.servings}</div>
                        <div style={{ fontSize:10, color:"#aaa" }}>Servings</div>
                      </div>
                      <div style={{ background:"#f7f4ef", borderRadius:10, padding:10, textAlign:"center" }}>
                        <div style={{ fontSize:18 }}>💰</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#2d5a1b" }}>${selectedDish.costPerPersonCAD?.toFixed(2)||"~"}/person</div>
                        <div style={{ fontSize:10, color:"#aaa" }}>Est. Cost CAD</div>
                      </div>
                    </div>
                    {selectedDish.nutrition && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:600, color:"#7a7060", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Nutrition per serving</p>
                        <div className="nutrition-grid">
                          {[["🔥",selectedDish.nutrition.calories,"cal"],["💪",selectedDish.nutrition.protein,"protein"],["🌾",selectedDish.nutrition.carbs,"carbs"],["🫒",selectedDish.nutrition.fat,"fat"]].map(([icon,val,lbl],i) => (
                            <div key={i} className="nutrition-cell">
                              <div style={{ fontSize:16 }}>{icon}</div>
                              <div className="nutrition-val">{val}</div>
                              <div className="nutrition-lbl">{lbl}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedDish.prepTime && <div style={{ display:"flex", gap:16, fontSize:12, color:"#7a7060", marginTop:8 }}><span>🥄 Prep: {selectedDish.prepTime}</span><span>🍳 Cook: {selectedDish.cookTime}</span></div>}
                  </div>
                </div>
                {selectedDish.tips && selectedDish.tips.length > 0 && (
                  <div className="card" style={{ padding:16, marginBottom:16, background:"#fef9f0", border:"1px solid #f0e0b0" }}>
                    <p className="section-label" style={{ color:"#d4870a" }}>💡 Chef's Tips</p>
                    {selectedDish.tips.map((tip, i) => <p key={i} style={{ fontSize:13, color:"#7a7060", marginBottom:i<selectedDish.tips.length-1?8:0, paddingLeft:12, borderLeft:"2px solid #d4870a" }}>{tip}</p>)}
                  </div>
                )}
                {dishDetailsLoading && (
                  <div style={{ textAlign:"center", padding:"24px", color:"#7a7060", fontSize:14 }}>
                    <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                    Loading ingredients, nutrition & instructions...
                  </div>
                )}
                <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
                  <div style={{ padding:"14px 16px", background:"#f7f4ef", borderBottom:"1px solid #e2dbd0" }}>
                    <p className="section-label" style={{ margin:0 }}>🥕 Ingredients — check what you already have</p>
                  </div>
                  {selectedDish.ingredients && selectedDish.ingredients.map((ing, idx) => (
                    <div key={idx} style={{ display:"flex", alignItems:"center", padding:"12px 16px", borderBottom:"1px solid #f5f0e8", gap:12 }}>
                      <input type="checkbox" checked={!!haveIngredients[idx]} onChange={() => setHaveIngredients(p => ({...p,[idx]:!p[idx]}))} style={{ width:18, height:18, accentColor:"#3d8c23", cursor:"pointer", flexShrink:0 }} />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:15, textDecoration:haveIngredients[idx]?"line-through":"none", color:haveIngredients[idx]?"#bbb":"#1a1a1a" }}><strong>{ing.amount} {ing.unit}</strong> {ing.name}</span>
                        {ing.notes && <p style={{ fontSize:12, color:"#aaa", margin:0 }}>{ing.notes}</p>}
                      </div>
                      {haveIngredients[idx] && <span style={{ fontSize:12, color:"#3d8c23", fontWeight:600 }}>Have it ✓</span>}
                    </div>
                  ))}
                  <div style={{ padding:16, background:"#f7f4ef", borderTop:"1px solid #e2dbd0" }}>
                    <p style={{ fontSize:13, color:"#7a7060", marginBottom:10 }}>{Object.values(haveIngredients).filter(Boolean).length} of {selectedDish.ingredients?.length} ingredients already at home</p>
                    <button onClick={addMissingToList} className="btn-primary" style={{ width:"100%" }}>Add {selectedDish.ingredients?.filter((_,idx) => !haveIngredients[idx]).length} missing items to Grocery List</button>
                  </div>
                </div>
                <div className="card" style={{ overflow:"hidden" }}>
                  <div style={{ padding:"14px 16px", background:"#f7f4ef", borderBottom:"1px solid #e2dbd0" }}>
                    <p className="section-label" style={{ margin:0 }}>👨‍🍳 Step-by-Step Instructions</p>
                  </div>
                  {selectedDish.steps && selectedDish.steps.map((step, idx) => (
                    <div key={idx} style={{ display:"flex", gap:14, padding:"16px 16px", borderBottom:"1px solid #f5f0e8", alignItems:"flex-start" }}>
                      <span className="step-num">{idx+1}</span>
                      <div>
                        {step.title && <p style={{ fontSize:13, fontWeight:700, color:"#2d5a1b", margin:"0 0 4px" }}>{step.title}</p>}
                        <p style={{ fontSize:14, color:"#1a1a1a", lineHeight:1.7, margin:0 }}>{step.detail || step}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                  <div>
                    <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#2d5a1b", margin:0 }}>Meal Ideas</h2>
                    <p style={{ fontSize:13, color:"#7a7060", marginTop:2 }}>Sorted by meal type with cost & time</p>
                  </div>
                  <button onClick={loadDishes} disabled={dishesLoading} style={{ background:"#e8f5e0", border:"none", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:600, color:"#2d5a1b", cursor:"pointer" }}>
                    {dishesLoading ? "Loading..." : dishes.length ? "Refresh" : "Suggest Dishes"}
                  </button>
                </div>
                {dishes.length > 0 && (
                  <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:12 }}>
                    {mealCategories.map(cat => (
                      <button key={cat} onClick={() => setActiveMealCat(cat)} style={{ whiteSpace:"nowrap", padding:"6px 14px", borderRadius:99, border:"1.5px solid", borderColor:activeMealCat===cat?"#2d5a1b":"#e2dbd0", background:activeMealCat===cat?"#2d5a1b":"#fff", color:activeMealCat===cat?"#fff":"#7a7060", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                        {cat === "All" ? "All Meals" : (MEAL_CATEGORY_META[cat]?.icon||"") + " " + cat}
                      </button>
                    ))}
                  </div>
                )}
                {favouriteDishes.length > 0 && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <span style={{ fontSize:18 }}>❤️</span>
                      <span style={{ fontSize:14, fontWeight:700, color:"#c0392b" }}>Favourite Dishes</span>
                      <span style={{ fontSize:12, color:"#aaa" }}>({favouriteDishes.length})</span>
                    </div>
                    <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:8 }}>
                      {favouriteDishes.map((dish, i) => (
                        <div key={i} onClick={() => openDish(dish)} style={{ flexShrink:0, width:140, background:"#fff", border:"2px solid #f5c0c0", borderRadius:12, padding:12, cursor:"pointer", textAlign:"center" }}>
                          <div style={{ fontSize:32, marginBottom:4 }}>{dish.emoji}</div>
                          <p style={{ fontSize:12, fontWeight:600, color:"#1a1a1a", margin:"0 0 2px", lineHeight:1.3 }}>{dish.name}</p>
                          <p style={{ fontSize:11, color:"#aaa", margin:0 }}>{dish.mealCategory}</p>
                          <button onClick={e => { e.stopPropagation(); toggleFavourite(dish); }} style={{ marginTop:6, background:"none", border:"none", fontSize:14, cursor:"pointer", color:"#c0392b" }}>✕ Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {dishError && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:10, padding:"12px 16px", marginBottom:16, color:"#c0392b", fontSize:14 }}>⚠️ {dishError}</div>}
                {dishesLoading && <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}><div style={{ fontSize:40, marginBottom:12 }}>🍳</div><p style={{ fontStyle:"italic" }}>Finding dishes based on your preferences...</p></div>}
                {!dishesLoading && dishes.length === 0 && (
                  <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}>
                    <div style={{ fontSize:48, marginBottom:12 }}>🍽️</div>
                    <p style={{ fontStyle:"italic", fontSize:15, marginBottom:16 }}>Get personalized dish recommendations with cost and time estimates.</p>
                    <button onClick={loadDishes} className="btn-primary">Suggest Dishes for Me</button>
                  </div>
                )}
                {activeMealCat === "All" ? (
                  Object.entries(dishesByCategory).map(([cat, catDishes]) => {
                    const meta = MEAL_CATEGORY_META[cat] || { icon:"🍽️", color:"#666", bg:"#f0f0f0" };
                    return (
                      <div key={cat}>
                        <div className="meal-cat-header">
                          <span style={{ fontSize:20 }}>{meta.icon}</span>
                          <span style={{ fontSize:14, fontWeight:700, color:meta.color }}>{cat}</span>
                          <span style={{ fontSize:12, color:"#aaa" }}>({catDishes.length} {catDishes.length===1?"dish":"dishes"})</span>
                        </div>
                        {catDishes.map((dish, i) => <DishCard key={i} dish={dish} onClick={() => openDish(dish)} saleItems={saleItems} favourites={favouriteDishes} onToggleFavourite={toggleFavourite} />)}
                      </div>
                    );
                  })
                ) : (
                  filteredDishes.length === 0
                    ? <div style={{ textAlign:"center", padding:"32px", color:"#bbb" }}><p>No {activeMealCat} dishes yet. Click Refresh.</p></div>
                    : filteredDishes.map((dish, i) => <DishCard key={i} dish={dish} onClick={() => openDish(dish)} saleItems={saleItems} favourites={favouriteDishes} onToggleFavourite={toggleFavourite} />)
                )}
                {dishes.length > 0 && <button onClick={loadDishes} disabled={dishesLoading} className="btn-ghost" style={{ width:"100%", marginTop:8 }}>🔄 Get 8 More Dish Ideas</button>}
              </div>
            )}
          </div>
        )}

        {/* COMPARE TAB */}
        {tab === "compare" && (
          <div>
            {!results && <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}><div style={{ fontSize:48, marginBottom:12 }}>📊</div><p style={{ fontStyle:"italic", fontSize:15 }}>Build your list and tap Find Best Prices.</p><button onClick={() => setTab("list")} className="btn-ghost" style={{ marginTop:16 }}>Go to List</button></div>}
            {results && (
              <div>
                {overBudget && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:12, padding:16, marginBottom:16, display:"flex", alignItems:"center", gap:10 }}><span style={{ fontSize:24 }}>⚠️</span><div><p style={{ fontWeight:700, color:"#c0392b", margin:"0 0 2px" }}>Over budget by ${(weekSpend-budget).toFixed(2)} CAD</p><p style={{ fontSize:13, color:"#c0392b", margin:0 }}>Consider removing items or using multi-store option.</p></div></div>}
                <p className="section-label">Top 3 Shopping Strategies — tap to select</p>
                <p style={{ fontSize:12, color:"#aaa", marginBottom:12 }}>🔍 Prices from live web search. Tap a strategy to select it for Save Week.</p>
                {results.combinations && results.combinations.map((combo, i) => (
                  <div key={i} onClick={() => { setSelectedCombo(i); setWeekSpend(combo.totalCAD); }} className="card" style={{ marginBottom:14, overflow:"hidden", border:selectedCombo===i?"2px solid #3d8c23":"1px solid #e2dbd0", cursor:"pointer", transform:selectedCombo===i?"scale(1.01)":"none", transition:"all 0.2s" }}>
                    <div style={{ padding:"14px 16px", background:selectedCombo===i?"#e8f5e0":i===1?"#fef9f0":"#f7f4ef", display:"flex", justifyContent:"space-between", alignItems:"flex-start", borderBottom:"1px solid #f0ebe0" }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700, color:selectedCombo===i?"#2d5a1b":"#1a1a1a" }}>{selectedCombo===i?"✅ ":i===0?"🥇 ":i===1?"🥈 ":"🥉 "}{combo.label}</div>
                        <div style={{ fontSize:12, color:"#7a7060", marginTop:3 }}>{combo.trips} trip{combo.trips!==1?"s":""}</div>
                        {combo.tip && <div style={{ fontSize:12, color:"#7a7060", fontStyle:"italic", marginTop:3 }}>💡 {combo.tip}</div>}
                      </div>
                      <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                        <div style={{ fontSize:22, fontWeight:700, color:selectedCombo===i?"#2d5a1b":"#1a1a1a" }}>${combo.totalCAD?.toFixed(2)} <span style={{ fontSize:11, fontWeight:400, color:"#aaa" }}>CAD</span></div>
                        {combo.savingsVsWorst > 0 && <div style={{ fontSize:12, color:"#3d8c23", fontWeight:600 }}>Save ${combo.savingsVsWorst.toFixed(2)}</div>}
                      </div>
                    </div>
                    {combo.stores && combo.stores.map((store, j) => {
                      const storeObj = typeof store === "object" ? store : { name: store };
                      return (
                        <div key={j} style={{ padding:"12px 16px", borderBottom:"1px solid #f5f0e8", background:"#fafafa" }}>
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                            <div>
                              <p style={{ fontSize:14, fontWeight:700, color:"#1a1a1a", margin:"0 0 2px" }}>🏪 {storeObj.name}</p>
                              {storeObj.address && <p style={{ fontSize:12, color:"#7a7060", margin:"0 0 2px" }}>📍 {storeObj.address}</p>}
                              {storeObj.hours && <p style={{ fontSize:12, color:"#7a7060", margin:0 }}>🕐 {storeObj.hours}</p>}
                            </div>
                            {storeObj.distanceKm && <span style={{ fontSize:12, fontWeight:600, color:"#3d8c23", background:"#e8f5e0", padding:"3px 8px", borderRadius:99, flexShrink:0, marginLeft:8 }}>{storeObj.distanceKm} km</span>}
                          </div>
                        </div>
                      );
                    })}
                    {combo.breakdown && combo.breakdown.map((b, j) => (
                      <div key={j} style={{ padding:"10px 16px", borderBottom:"1px solid #f5f0e8" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, fontWeight:600, marginBottom:4 }}><span>{b.store}</span><span style={{ color:"#3d8c23" }}>${b.subtotal?.toFixed(2)}</span></div>
                        <div style={{ fontSize:12, color:"#7a7060" }}>{b.items?.join(", ")}</div>
                      </div>
                    ))}
                  </div>
                ))}
                {results.perItemPrices?.length > 0 && (
                  <div className="card" style={{ overflow:"hidden" }}>
                    <div style={{ padding:"12px 16px", borderBottom:"1px solid #f0ebe0", background:"#f7f4ef" }}><p className="section-label" style={{ margin:0 }}>Price per Item</p></div>
                    {results.perItemPrices.map((p, i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid #f5f0e8", fontSize:14 }}>
                        <span style={{ color:"#444" }}>{p.name}</span>
                        <span style={{ color:"#3d8c23", fontWeight:600 }}>${p.price?.toFixed(2)} <span style={{ color:"#aaa", fontWeight:400, fontSize:12 }}>@ {p.store}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WISHLIST TAB */}
        {tab === "wishlist" && (
          <div className="fade-in">
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div>
                <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:"#2d5a1b", margin:0 }}>⭐ Sale Watchlist</h2>
                <p style={{ fontSize:13, color:"#7a7060", marginTop:2 }}>Watch for sales on items you want</p>
              </div>
              <button onClick={checkWishlistSales} disabled={wishlistChecking || wishlist.length === 0} className="btn-primary" style={{ padding:"8px 14px", fontSize:12, opacity:wishlist.length===0?0.5:1 }}>
                {wishlistChecking ? "🔍 Checking..." : "🔍 Check Sales"}
              </button>
            </div>

            {/* Add item */}
            <div className="card" style={{ padding:16, marginBottom:16 }}>
              <p className="section-label">➕ Add Item to Watch</p>
              <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                <input className="input" placeholder="e.g. Coca-Cola 24 pack, lobster, ribeye..." value={wishlistInput} onChange={e => setWishlistInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addToWishlist()} />
                <button onClick={addToWishlist} style={{ background:"#2d5a1b", color:"#fff", border:"none", borderRadius:10, padding:"11px 18px", fontSize:20, cursor:"pointer", fontWeight:700 }}>+</button>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:13, color:"#7a7060", whiteSpace:"nowrap" }}>Alert me below:</span>
                <span style={{ fontSize:13, color:"#7a7060" }}>$</span>
                <input type="number" className="input" placeholder="e.g. 8.99" value={wishlistTargetPrice} onChange={e => setWishlistTargetPrice(e.target.value)} style={{ maxWidth:100 }} />
                <span style={{ fontSize:12, color:"#aaa" }}>CAD (optional)</span>
              </div>
            </div>

            {wishlistError && <div style={{ background:"#fde8e8", border:"1px solid #f5c0c0", borderRadius:10, padding:"12px 16px", marginBottom:12, color:"#c0392b", fontSize:13 }}>⚠️ {wishlistError}</div>}

            {wishlist.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 24px" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>⭐</div>
                <p style={{ fontSize:15, color:"#bbb", fontStyle:"italic", marginBottom:6 }}>Your watchlist is empty.</p>
                <p style={{ fontSize:13, color:"#aaa" }}>Add items you want when they go on sale — like lobster or a case of Coca-Cola.</p>
              </div>
            ) : (
              <div>
                {/* On sale banner */}
                {wishlist.some(w => w.on_sale) && (
                  <div style={{ background:"#e8f5e0", border:"2px solid #3d8c23", borderRadius:14, padding:16, marginBottom:16 }}>
                    <p style={{ fontSize:14, fontWeight:700, color:"#2d5a1b", margin:"0 0 10px" }}>🎉 On sale now!</p>
                    {wishlist.filter(w => w.on_sale).map((w, i) => (
                      <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom: i < wishlist.filter(x=>x.on_sale).length-1 ? "1px solid #c8e6c0" : "none" }}>
                        <span style={{ fontSize:14, color:"#2d5a1b", fontWeight:600 }}>✅ {w.name}</span>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          {w.current_price && <span style={{ fontSize:15, fontWeight:700, color:"#2d5a1b" }}>${w.current_price?.toFixed(2)}</span>}
                          <button onClick={() => addWishlistItemToCart(w)} className="btn-primary" style={{ padding:"5px 12px", fontSize:12 }}>+ Add to List</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Watchlist items */}
                {wishlist.map(item => {
                  const result = wishlistResults[item.id];
                  const isOnSale = item.on_sale;
                  const lastChecked = item.last_checked ? new Date(item.last_checked).toLocaleDateString("en-CA") : null;
                  return (
                    <div key={item.id} className="card" style={{ marginBottom:12, overflow:"hidden", border: isOnSale ? "2px solid #3d8c23" : "1px solid #e2dbd0" }}>
                      {/* Item header */}
                      <div style={{ padding:"12px 16px", background: isOnSale ? "#e8f5e0" : "#f7f4ef", display:"flex", justifyContent:"space-between", alignItems:"center", borderBottom:"1px solid #f0ebe0" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <span style={{ fontSize:20 }}>{isOnSale ? "🔥" : "⭐"}</span>
                          <div>
                            <p style={{ fontSize:15, fontWeight:700, color: isOnSale ? "#2d5a1b" : "#1a1a1a", margin:0 }}>{item.name}</p>
                            {item.target_price && <p style={{ fontSize:11, color:"#7a7060", margin:0 }}>🎯 Target: ${item.target_price?.toFixed(2)} CAD</p>}
                          </div>
                          {isOnSale && <span style={{ fontSize:10, fontWeight:700, background:"#3d8c23", color:"#fff", padding:"2px 8px", borderRadius:99 }}>ON SALE</span>}
                        </div>
                        <button onClick={() => removeFromWishlist(item.id)} style={{ background:"none", border:"none", fontSize:18, color:"#ccc", cursor:"pointer" }}>×</button>
                      </div>

                      {/* Price info */}
                      <div style={{ padding:"12px 16px" }}>
                        {item.current_price ? (
                          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                            <span style={{ fontSize:13, color:"#7a7060" }}>Current price</span>
                            <span style={{ fontSize:18, fontWeight:700, color: isOnSale ? "#2d5a1b" : "#1a1a1a" }}>${item.current_price?.toFixed(2)} CAD</span>
                          </div>
                        ) : (
                          <p style={{ fontSize:13, color:"#aaa", fontStyle:"italic", marginBottom:8 }}>Tap "Check Sales" to find current price</p>
                        )}
                        {result?.saleStore && <p style={{ fontSize:13, fontWeight:600, color:"#3d8c23", margin:"0 0 4px" }}>🏪 {result.saleStore}{result.saleEnds && result.saleEnds !== "unknown" ? " · Until " + result.saleEnds : ""}</p>}
                        {result?.address && <p style={{ fontSize:12, color:"#7a7060", margin:"0 0 3px" }}>📍 {result.address}</p>}
                        {result?.hours && <p style={{ fontSize:12, color:"#7a7060", margin:"0 0 4px" }}>🕐 {result.hours}</p>}
                        {result?.note && <p style={{ fontSize:12, color:"#7a7060", fontStyle:"italic", margin:"0 0 4px" }}>{result.note}</p>}
                        {lastChecked && <p style={{ fontSize:11, color:"#bbb", margin:"4px 0 0" }}>Last checked: {lastChecked}</p>}
                        {isOnSale && (
                          <button onClick={() => addWishlistItemToCart(item)} className="btn-primary" style={{ width:"100%", marginTop:10, padding:10, fontSize:13 }}>+ Add to Grocery List</button>
                        )}
                      </div>
                    </div>
                  );
                })}

                <div style={{ background:"#f7f4ef", borderRadius:12, padding:14, marginTop:8 }}>
                  <p style={{ fontSize:12, color:"#7a7060", margin:0 }}>💡 Tap <strong>Check Sales</strong> to search local grocery stores for current prices and flyer deals.</p>
                </div>
              </div>
            )}
          </div>
        )}

                {/* HISTORY TAB */}
        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <div style={{ textAlign:"center", padding:"48px 24px", color:"#bbb" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📈</div>
                <p style={{ fontStyle:"italic", fontSize:15 }}>No history yet. After comparing prices, tap Save Week.</p>
              </div>
            ) : (
              <div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
                  <div className="card" style={{ padding:16, textAlign:"center" }}><p style={{ fontSize:12, color:"#7a7060", margin:"0 0 4px" }}>Avg Weekly Spend</p><p style={{ fontSize:24, fontFamily:"'DM Serif Display',serif", color:"#2d5a1b", margin:0 }}>${avgSpend}</p><p style={{ fontSize:11, color:"#aaa", margin:"2px 0 0" }}>CAD</p></div>
                  <div className="card" style={{ padding:16, textAlign:"center" }}><p style={{ fontSize:12, color:"#7a7060", margin:"0 0 4px" }}>Weeks Tracked</p><p style={{ fontSize:24, fontFamily:"'DM Serif Display',serif", color:"#2d5a1b", margin:0 }}>{history.length}</p><p style={{ fontSize:11, color:"#aaa", margin:"2px 0 0" }}>of 12 max</p></div>
                </div>
                {history.length >= 2 && (
                  <div className="card" style={{ padding:16, marginBottom:16 }}>
                    <p className="section-label">Spending Trend</p>
                    <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", gap:16 }}>
                      <Sparkline weeks={[...history].reverse()} />
                      <div style={{ fontSize:12, color:"#7a7060", textAlign:"right" }}>
                        <div>Budget: <strong style={{ color:"#2d5a1b" }}>${budget}/wk</strong></div>
                        <div style={{ marginTop:4 }}>Last week: <strong>${history[0]?.spent?.toFixed(2)}</strong></div>
                      </div>
                    </div>
                  </div>
                )}
                <p className="section-label">Weekly Log</p>
                {history.map((w, i) => {
                  const over = w.spent > w.budget;
                  return (
                    <div key={i} className="card" style={{ marginBottom:10, padding:16, display:"flex", justifyContent:"space-between", alignItems:"center", borderLeft:"4px solid "+(over?"#c0392b":"#3d8c23") }}>
                      <div>
                        <p style={{ fontWeight:600, margin:"0 0 3px", fontSize:15 }}>{w.date}</p>
                        <p style={{ fontSize:12, color:"#7a7060", margin:0 }}>{w.store}</p>
                        {w.items?.length > 0 && <p style={{ fontSize:11, color:"#aaa", margin:"3px 0 0" }}>{w.items.slice(0,4).join(", ")}{w.items.length>4?" +"+(w.items.length-4)+" more":""}</p>}
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <p style={{ fontWeight:700, fontSize:18, color:over?"#c0392b":"#2d5a1b", margin:0 }}>${w.spent?.toFixed(2)}</p>
                        <p style={{ fontSize:11, color:"#aaa", margin:0 }}>of ${w.budget} budget</p>
                        {over && <p style={{ fontSize:11, color:"#c0392b", margin:0, fontWeight:600 }}>+${(w.spent-w.budget).toFixed(2)} over</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FAMILY TAB */}
        {tab === "family" && (
          <div>
            {!household ? (
              <div className="card" style={{ padding:24, textAlign:"center" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🏠</div>
                <h3 style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:"#2d5a1b", marginBottom:8 }}>Create a Family Household</h3>
                <p style={{ fontSize:14, color:"#7a7060", marginBottom:20 }}>Invite family members to share and sync your grocery list in real time.</p>
                <button onClick={createHousehold} className="btn-primary" style={{ width:"100%" }}>Create Family Household</button>
              </div>
            ) : (
              <div>
                {/* Household info */}
                <div className="card" style={{ padding:16, marginBottom:12, background:"#e8f5e0", border:"1px solid #b8dba0" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <span style={{ fontSize:36 }}>🏠</span>
                    <div>
                      <p style={{ fontSize:16, fontWeight:700, color:"#2d5a1b", margin:0 }}>{household.name}</p>
                      <p style={{ fontSize:12, color:"#5a8a40", margin:"2px 0 0" }}>📡 Grocery list syncs in real time for all members</p>
                    </div>
                  </div>
                </div>

                {/* Members list */}
                <div className="card" style={{ padding:16, marginBottom:12 }}>
                  <p className="section-label" style={{ marginBottom:12 }}>Members ({householdMembers.length + 1})</p>
                  {/* Owner */}
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:12, background:"#e8f5e0", border:"1px solid #b8dba0", marginBottom:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:36, height:36, borderRadius:99, background:"#2d5a1b", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>👑</div>
                      <div>
                        <p style={{ fontSize:14, fontWeight:700, color:"#2d5a1b", margin:0 }}>{profile?.name || "You"}</p>
                        <p style={{ fontSize:11, color:"#5a8a40", margin:0 }}>Owner · You</p>
                      </div>
                    </div>
                  </div>
                  {/* Members */}
                  {householdMembers.length === 0 ? (
                    <p style={{ fontSize:13, color:"#aaa", textAlign:"center", padding:"12px 0" }}>No members yet. Invite family below!</p>
                  ) : householdMembers.map((m, i) => (
                    <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", borderRadius:12, background:"#f7f4ef", border:"1px solid #e2dbd0", marginBottom:8 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:99, background:"#e2dbd0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>👤</div>
                        <div>
                          <p style={{ fontSize:14, fontWeight:600, color:"#1a1a1a", margin:0 }}>{m.profiles?.name || "Family Member"}</p>
                          <p style={{ fontSize:11, color:"#aaa", margin:0 }}>Member · Joined</p>
                        </div>
                      </div>
                      {household?.owner_id === user?.id && (
                        <button onClick={async () => {
                          if (window.confirm("Remove " + (m.profiles?.name || "this member") + " from the family?")) {
                            await supabase.from("household_members").delete().eq("id", m.id);
                            loadHouseholdMembers(household.id);
                          }
                        }} style={{ background:"none", border:"1px solid #f5c0c0", borderRadius:8, padding:"6px 12px", fontSize:12, color:"#c0392b", cursor:"pointer", fontWeight:600 }}>Remove</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Invite section */}
                {household?.owner_id === user?.id && (
                  <div className="card" style={{ padding:16 }}>
                    <p className="section-label" style={{ marginBottom:10 }}>Invite Family Member</p>
                    <p style={{ fontSize:13, color:"#7a7060", marginBottom:12 }}>They'll receive an invite when they log in to MyGroceryWeek.</p>
                    <div style={{ display:"flex", gap:8, marginBottom:10 }}>
                      <input className="input" placeholder="Enter email address..." value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && inviteFamilyMember()} />
                      <button onClick={inviteFamilyMember} disabled={!inviteEmail} className="btn-primary" style={{ whiteSpace:"nowrap", padding:"11px 16px" }}>Invite</button>
                    </div>
                    {inviteStatus === "sent" && <div style={{ background:"#e8f5e0", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#2d5a1b", fontWeight:600 }}>✅ Invite sent!</div>}
                    {inviteStatus === "error" && <div style={{ background:"#fde8e8", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#c0392b" }}>❌ Could not send invite. Try again.</div>}
                  </div>
                )}

                {/* Grocery list activity - who added/checked what */}
                {items.some(i => i.addedBy || i.crossedBy) && (
                  <div className="card" style={{ padding:16, marginTop:12 }}>
                    <p className="section-label" style={{ marginBottom:12 }}>Recent Activity</p>
                    {items.filter(i => i.addedBy || i.crossedBy).slice(0, 10).map((item, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f5f0e8" }}>
                        <span style={{ fontSize:16 }}>{checked[item.id] ? "✅" : "🛒"}</span>
                        <div style={{ flex:1 }}>
                          <span style={{ fontSize:13, fontWeight:500, color: checked[item.id] ? "#aaa" : "#1a1a1a", textDecoration: checked[item.id] ? "line-through" : "none" }}>{item.name}</span>
                          <div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>
                            {item.addedBy && <span>Added by <strong style={{ color:"#7a7060" }}>{item.addedBy}</strong></span>}
                            {item.crossedBy && checked[item.id] && <span> · Crossed by <strong style={{ color:"#7a7060" }}>{item.crossedBy}</strong></span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function DishCard({ dish, onClick, saleItems = [], favourites = [], onToggleFavourite }) {
  const meta = MEAL_CATEGORY_META[dish.mealCategory] || { icon:"🍽️", color:"#666", bg:"#f0f0f0" };
  const saleIngredients = dish.ingredients ? dish.ingredients.filter(ing =>
    saleItems.some(s => ing.name.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(ing.name.toLowerCase().split(" ")[0]))
  ) : [];
  const hasSale = saleIngredients.length > 0;
  const isFavourite = favourites.some(f => f.name === dish.name);
  return (
    <div className="dish-card" style={{ marginBottom:12, border: hasSale ? "2px solid #3d8c23" : "1px solid var(--border)", position:"relative" }}>
      <div style={{ display:"flex", alignItems:"center" }} onClick={onClick}>
        <div style={{ width:80, height:80, display:"flex", alignItems:"center", justifyContent:"center", fontSize:44, background:"linear-gradient(135deg,#f7f4ef,#e8f5e0)", flexShrink:0, borderRadius:"14px 0 0 14px" }}>{dish.emoji}</div>
        <div style={{ padding:"10px 12px", flex:1, minWidth:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:2 }}>
            <h3 style={{ fontSize:14, fontWeight:600, color:"#1a1a1a", margin:0, flex:1, marginRight:8 }}>{dish.name}</h3>
            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:700, color:DIFFICULTY_COLOR[dish.difficulty]||"#666", background:"#f7f4ef", padding:"2px 8px", borderRadius:99 }}>{dish.difficulty}</span>
              {onToggleFavourite && (
                <button onClick={e => { e.stopPropagation(); onToggleFavourite(dish); }} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", lineHeight:1, filter: isFavourite ? "none" : "grayscale(1) opacity(0.4)", padding:0 }} title={isFavourite ? "Remove from favourites" : "Add to favourites"}>❤️</button>
              )}
            </div>
          </div>
          <p style={{ fontSize:12, color:"#7a7060", margin:"3px 0 6px", lineHeight:1.4 }}>{dish.description}</p>
          {hasSale && (
            <div style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#e8f5e0", borderRadius:99, padding:"2px 10px", marginBottom:4 }}>
              <span style={{ fontSize:11, fontWeight:700, color:"#2d5a1b" }}>🏷️ {saleIngredients.length} ingredient{saleIngredients.length>1?"s":""} on sale!</span>
            </div>
          )}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", fontSize:11, color:"#aaa" }}>
            <span>⏱ {dish.totalTime||dish.cookTime}</span>
            <span>👥 {dish.servings} servings</span>
            {dish.costPerPersonCAD && <span style={{ background:"#e8f5e0", color:"#2d5a1b", padding:"1px 7px", borderRadius:99, fontWeight:600 }}>${dish.costPerPersonCAD?.toFixed(2)}/person</span>}
            <span style={{ background:meta.bg, color:meta.color, padding:"1px 7px", borderRadius:99, fontWeight:600 }}>{meta.icon} {dish.mealCategory}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
