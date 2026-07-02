import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pedyvooyxzuteguegovv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlZHl2b295eHp1dGVndWVnb3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5ODI5MDIsImV4cCI6MjA5ODU1ODkwMn0.N3gc77xZWxG5IZflkn2LWsSm6OXGQzVlqVIPIcfwmMY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Tables = {
  profiles: {
    Row: {
      id: string;
      email: string;
      watch_time_hours: number;
    };
  };
  rooms: {
    Row: {
      id: string;
      room_name: string;
      current_url: string;
      is_playing: boolean;
      playback_time: number;
      host_id: string;
    };
  };
  messages: {
    Row: {
      id: string;
      room_id: string;
      user_id: string;
      user_email: string;
      message_text: string;
      created_at: string;
    };
  };
};
