// Kanji of the Day - Alpine.js App

// Mulberry32 seeded PRNG
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded PRNG
function seededShuffle(arr, seed) {
  const copy = [...arr];
  const rng = mulberry32(seed);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Date helpers
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a, b) {
  const msPerDay = 86400000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((utcB - utcA) / msPerDay);
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Alpine.js component
function kanjiApp() {
  return {
    kanjiList: [],
    currentKanji: null,
    currentDate: null,
    level: "n5",
    startDate: new Date(2026, 0, 1), // Jan 1, 2026
    loading: true,

    async init() {
      await this.loadLevel(this.level);
      this.navigateToHash();
      window.addEventListener("hashchange", () => this.navigateToHash());
    },

    async loadLevel(level) {
      this.loading = true;
      this.level = level;
      try {
        const resp = await fetch(`data/${level}.json`);
        this.kanjiList = await resp.json();
      } catch (e) {
        console.error(`Failed to load ${level} data:`, e);
        this.kanjiList = [];
      }
      this.selectKanjiForDate(this.currentDate || today());
      this.loading = false;
    },

    selectKanjiForDate(date) {
      // Clamp to valid range
      if (date < this.startDate) date = new Date(this.startDate);
      const t = today();
      if (date > t) date = new Date(t);

      this.currentDate = date;

      if (this.kanjiList.length === 0) {
        this.currentKanji = null;
        return;
      }

      const dayIndex = daysBetween(this.startDate, date);
      const cycleLength = this.kanjiList.length;
      const cycleNum = Math.floor(dayIndex / cycleLength);
      const posInCycle = dayIndex % cycleLength;

      // Use both cycle number and level as seed so each level has a different order
      const seed = cycleNum * 31 + this.level.charCodeAt(1);
      const shuffled = seededShuffle(this.kanjiList, seed);
      this.currentKanji = shuffled[posInCycle];
      this.showStrokes = false;
      this.strokeAnimating = false;
      this.strokeStep = -1;

      // Update URL hash without triggering hashchange
      const hash = `#${formatDate(date)}`;
      if (window.location.hash !== hash) {
        history.replaceState(null, "", hash);
      }
    },

    navigateToHash() {
      const hash = window.location.hash.slice(1);
      if (hash && /^\d{4}-\d{2}-\d{2}$/.test(hash)) {
        this.selectKanjiForDate(parseDate(hash));
      } else {
        this.selectKanjiForDate(today());
      }
    },

    prevDay() {
      this.selectKanjiForDate(addDays(this.currentDate, -1));
    },

    nextDay() {
      this.selectKanjiForDate(addDays(this.currentDate, 1));
    },

    goToday() {
      this.selectKanjiForDate(today());
    },

    // Calendar state
    calendarOpen: false,
    calendarYear: 2026,
    calendarMonth: 0,

    toggleCalendar() {
      if (!this.calendarOpen && this.currentDate) {
        this.calendarYear = this.currentDate.getFullYear();
        this.calendarMonth = this.currentDate.getMonth();
      }
      this.calendarOpen = !this.calendarOpen;
    },

    closeCalendar() {
      this.calendarOpen = false;
    },

    calendarPrevMonth() {
      if (this.calendarMonth === 0) {
        if (this.calendarYear > 2026) {
          this.calendarYear--;
          this.calendarMonth = 11;
        }
      } else {
        this.calendarMonth--;
      }
    },

    calendarNextMonth() {
      const t = today();
      const nextMonth = this.calendarMonth + 1;
      const nextYear = nextMonth > 11 ? this.calendarYear + 1 : this.calendarYear;
      const nm = nextMonth > 11 ? 0 : nextMonth;
      // Don't go past current month
      if (nextYear > t.getFullYear() || (nextYear === t.getFullYear() && nm > t.getMonth())) return;
      this.calendarMonth = nm;
      this.calendarYear = nextYear;
    },

    get canCalendarPrev() {
      return !(this.calendarYear === 2026 && this.calendarMonth === 0);
    },

    get canCalendarNext() {
      const t = today();
      const nextMonth = this.calendarMonth + 1;
      const nextYear = nextMonth > 11 ? this.calendarYear + 1 : this.calendarYear;
      const nm = nextMonth > 11 ? 0 : nextMonth;
      return !(nextYear > t.getFullYear() || (nextYear === t.getFullYear() && nm > t.getMonth()));
    },

    get calendarMonthLabel() {
      return new Date(this.calendarYear, this.calendarMonth, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    },

    get calendarDays() {
      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1);
      const lastDay = new Date(this.calendarYear, this.calendarMonth + 1, 0);
      const startDow = firstDay.getDay(); // 0=Sun
      const daysInMonth = lastDay.getDate();
      const t = today();
      const minDate = this.startDate;

      const cells = [];
      // Empty cells for days before the 1st
      for (let i = 0; i < startDow; i++) {
        cells.push({ day: null });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(this.calendarYear, this.calendarMonth, d);
        const isFuture = date > t;
        const isPast = date < minDate;
        cells.push({
          day: d,
          date,
          disabled: isFuture || isPast,
          isToday: sameDay(date, t),
          isSelected: this.currentDate && sameDay(date, this.currentDate),
        });
      }
      return cells;
    },

    selectCalendarDay(cell) {
      if (cell.disabled || !cell.date) return;
      this.selectKanjiForDate(cell.date);
      this.calendarOpen = false;
    },

    // Stroke order state
    showStrokes: false,
    strokeAnimating: false,
    strokeStep: -1, // -1 = show all, 0..n = animating up to step

    toggleStrokes() {
      this.showStrokes = !this.showStrokes;
      if (this.showStrokes) {
        this.strokeStep = -1;
        this.strokeAnimating = false;
      }
    },

    playStrokes() {
      if (!this.currentKanji?.strokePaths) return;
      this.showStrokes = true;
      this.strokeAnimating = true;
      this.strokeStep = 0;
      this._animateNextStroke();
    },

    _animateNextStroke() {
      if (!this.strokeAnimating) return;
      const total = this.currentKanji.strokePaths.length;
      if (this.strokeStep >= total) {
        this.strokeAnimating = false;
        this.strokeStep = -1; // show all
        return;
      }
      setTimeout(() => {
        this.strokeStep++;
        this._animateNextStroke();
      }, 600);
    },

    get isToday() {
      return this.currentDate && sameDay(this.currentDate, today());
    },

    get isStart() {
      return this.currentDate && sameDay(this.currentDate, this.startDate);
    },

    get formattedDate() {
      return this.currentDate ? formatDate(this.currentDate) : "";
    },

    get displayDate() {
      if (!this.currentDate) return "";
      return this.currentDate.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    },

    get dayNumber() {
      if (!this.currentDate) return 0;
      return daysBetween(this.startDate, this.currentDate) + 1;
    },
  };
}
