
import { neon } from '@neondatabase/serverless';

export const handler = async (event: any) => {
  const sql = neon(process.env.DATABASE_URL!);
  const method = event.httpMethod;

  try {
    if (method === 'GET') {
      const userKey = event.queryStringParameters.userKey || 'default_user';
      const date = event.queryStringParameters.date;

      const results = await sql`
        SELECT count, is_active as "isActive", last_reminder_hour as "lastReminderHour"
        FROM water_reminders
        WHERE user_key = ${userKey} AND log_date = ${date}
        LIMIT 1
      `;
      
      return {
        statusCode: 200,
        body: JSON.stringify(results[0] || null),
      };
    }

    if (method === 'POST') {
      const { userKey, date, count, isActive, lastReminderHour } = JSON.parse(event.body);

      await sql`
        INSERT INTO water_reminders (user_key, log_date, count, is_active, last_reminder_hour)
        VALUES (${userKey}, ${date}, ${count}, ${isActive}, ${lastReminderHour})
        ON CONFLICT (user_key, log_date) DO UPDATE SET
          count = EXCLUDED.count,
          is_active = EXCLUDED.is_active,
          last_reminder_hour = EXCLUDED.last_reminder_hour,
          updated_at = CURRENT_TIMESTAMP
      `;

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Synced successfully' }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (error: any) {
    console.error('DB Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
