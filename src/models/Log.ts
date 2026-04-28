import mongoose, { Schema, Document } from 'mongoose';

export interface ILog extends Document {
  userId: string;
  allDay?: boolean;
  sync?: {
    status?: string;
    eventId?: string;
    export?: string;
  };
  activity?: {
    category?: string;
    name?: string;
    title?: string;
    additionalInfo?: string;
    crossActivity?: string;
    relationship?: string;
  };
  start?: {
    timezone?: string;
    datetime?: Date;
    year?: number;
    month?: number;
    day?: number;
    weekday?: string;
    hour?: string;
    timezoneOffset?: number;
  };
  end?: {
    timezone?: string;
    datetime?: Date;
    year?: number;
    month?: number;
    day?: number;
    weekday?: string;
    hour?: string;
    timezoneOffset?: number;
  };
  duration?: {
    days?: number;
    hours?: number;
    minutes?: number;
    seconds?: number;
    label?: string;
  };
  location?: {
    activity?: string;
    online?: string;
    other?: string;
  };
  cost?: {
    amountKRW?: number;
    amountForeign?: number;
    currency?: string;
    categoryDetail?: string;
    category?: string;
  };
  purchase?: Array<{
    item?: string;
    amount?: string;
    unit?: string;
  }>;
  food?: {
    type?: string;
    carbs?: string;
    fat?: string;
    drinks?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
    foods?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
    alcohols?: Array<{ item?: string; amount?: string; unit?: string; note?: string }>;
  };
  people?: Array<{
    method?: string;
    category?: string;
    target?: string;
  }>;
  transport?: {
    from?: string;
    to?: string;
    purpose?: string;
    method?: string;
    returnType?: string;
  };
  bowel?: {
    amount?: string;
    quality?: string;
    characteristics?: string;
  };
  body?: {
    weight?: number;
    muscleMass?: number;
    bodyFat?: number;
    bodyFatPercent?: number;
  };
  sleep?: {
    quality?: string;
  };
  exercise?: Array<{
    item?: string;
    amount?: number;
    unit?: string;
  }>;
  reading?: {
    title?: string;
  };
  movie?: {
    title?: string;
  };
  golf?: {
    score?: number;
    approach?: number;
    putts?: number;
  };
  income?: {
    gross?: number;
    net?: number;
  };
  travel?: {
    city?: string;
    theme?: string;
  };
  notes?: string;
}

const multiValueSchema = {
  item: String,
  amount: String,
  unit: String,
};

const foodItemSchema = {
  item: String,
  amount: String,
  unit: String,
  note: String,
};

const LogSchema = new Schema<ILog>({
  userId: { type: String, required: true, index: true },
  allDay: Boolean,
  sync: {
    status: String,
    eventId: String,
    export: String,
  },
  activity: {
    category: String,
    name: String,
    title: String,
    additionalInfo: String,
    crossActivity: String,
    relationship: String,
  },
  start: {
    timezone: String,
    datetime: Date,
    year: Number,
    month: Number,
    day: Number,
    weekday: String,
    hour: String,
    timezoneOffset: Number,
  },
  end: {
    timezone: String,
    datetime: Date,
    year: Number,
    month: Number,
    day: Number,
    weekday: String,
    hour: String,
    timezoneOffset: Number,
  },
  duration: {
    days: Number,
    hours: Number,
    minutes: Number,
    seconds: Number,
    label: String,
  },
  location: {
    activity: String,
    online: String,
    other: String,
  },
  cost: {
    amountKRW: Number,
    amountForeign: Number,
    currency: String,
    categoryDetail: String,
    category: String,
  },
  purchase: [multiValueSchema],
  food: {
    type: {
      type: String,
    },
    carbs: String,
    fat: String,
    drinks: [foodItemSchema],
    foods: [foodItemSchema],
    alcohols: [foodItemSchema],
  },
  people: [{
    method: String,
    category: String,
    target: String,
  }],
  transport: {
    from: String,
    to: String,
    purpose: String,
    method: String,
    returnType: String,
  },
  bowel: {
    amount: String,
    quality: String,
    characteristics: String,
  },
  body: {
    weight: Number,
    muscleMass: Number,
    bodyFat: Number,
    bodyFatPercent: Number,
  },
  sleep: {
    quality: String,
  },
  exercise: [{
    item: String,
    amount: Number,
    unit: String,
  }],
  reading: { title: String },
  movie: { title: String },
  golf: {
    score: Number,
    approach: Number,
    putts: Number,
  },
  income: {
    gross: Number,
    net: Number,
  },
  travel: {
    city: String,
    theme: String,
  },
  notes: String,
}, {
  timestamps: true,
  collection: 'log',
});

// Index for time-based queries
LogSchema.index({ userId: 1, 'start.datetime': -1 });

export default mongoose.models.Log || mongoose.model<ILog>('Log', LogSchema);
