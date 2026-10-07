/**
 * Internal Curated Motivational Quotes Library
 * Short, inspiring, original workplace quotes for daily check-in reminders.
 * Deterministic daily selection ensures retries and multiple checks on the same day
 * produce the exact same quote.
 */

export interface MotivationalQuote {
  quote: string;
  author: string;
}

export const MOTIVATIONAL_QUOTES: MotivationalQuote[] = [
  { quote: 'Small progress today becomes meaningful achievement tomorrow.', author: 'Techy Arts Team' },
  { quote: 'Focus on being productive instead of busy.', author: 'Techy Arts Team' },
  { quote: 'Quality is not an act, it is a habit built one day at a time.', author: 'Techy Arts Team' },
  { quote: 'Great work is born from consistency and deliberate effort.', author: 'Techy Arts Team' },
  { quote: 'Start strong, stay focused, and make today count.', author: 'Techy Arts Team' },
  { quote: 'Excellence happens when you care more than others think is necessary.', author: 'Techy Arts Team' },
  { quote: 'Your energy and dedication make a difference to the whole team.', author: 'Techy Arts Team' },
  { quote: 'Every challenge tackled today is a skill mastered for tomorrow.', author: 'Techy Arts Team' },
  { quote: 'Progress over perfection — keep building and moving forward.', author: 'Techy Arts Team' },
  { quote: 'Clarity comes from engagement, not from waiting.', author: 'Techy Arts Team' },
  { quote: 'The secret of getting ahead is simply getting started.', author: 'Techy Arts Team' },
  { quote: 'Dedication turns ordinary opportunities into extraordinary results.', author: 'Techy Arts Team' },
  { quote: 'Bring your best self to work today; innovation follows passion.', author: 'Techy Arts Team' },
  { quote: 'Teamwork is the fuel that allows common people to attain uncommon results.', author: 'Techy Arts Team' },
  { quote: 'Consistent action creates consistent momentum.', author: 'Techy Arts Team' },
  { quote: 'Believe in your craft and deliver with pride.', author: 'Techy Arts Team' },
  { quote: 'Today is a brand new opportunity to create value and grow.', author: 'Techy Arts Team' },
  { quote: 'Mastery is not an accident; it is the sum of daily disciplines.', author: 'Techy Arts Team' },
  { quote: 'Stay curious, solve problems, and empower those around you.', author: 'Techy Arts Team' },
  { quote: 'A positive attitude is a catalyst for exceptional performance.', author: 'Techy Arts Team' },
  { quote: 'Effort applied with intention always produces lasting results.', author: 'Techy Arts Team' },
  { quote: 'One step at a time, one task at a time, excellence is achieved.', author: 'Techy Arts Team' },
  { quote: 'Efficiency is doing things right; effectiveness is doing the right things.', author: 'Techy Arts Team' },
  { quote: 'Your dedication shapes the culture and success of our company.', author: 'Techy Arts Team' },
  { quote: 'Approach every task with curiosity and a commitment to quality.', author: 'Techy Arts Team' },
  { quote: 'The best way to predict your success is to build it today.', author: 'Techy Arts Team' },
  { quote: 'Stay resilient, stay focused, and celebrate each milestone.', author: 'Techy Arts Team' },
  { quote: 'Clear minds, steady hands, and teamwork solve any problem.', author: 'Techy Arts Team' },
  { quote: 'Turn good intentions into great deliverables.', author: 'Techy Arts Team' },
  { quote: 'Every day is a fresh canvas — paint something meaningful.', author: 'Techy Arts Team' },
];

export class QuoteService {
  /**
   * Deterministically select a quote for a given date string (YYYY-MM-DD) and optional seed.
   * Guaranteed to return the exact same quote on retry for the same date.
   */
  public static getDailyQuote(dateString: string, salt: string = 'techyarts-daily'): MotivationalQuote {
    let hash = 0;
    const key = `${dateString}_${salt}`;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    const index = Math.abs(hash) % MOTIVATIONAL_QUOTES.length;
    return MOTIVATIONAL_QUOTES[index];
  }
}
