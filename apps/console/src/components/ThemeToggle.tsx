import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../lib/theme';
import { SegmentedControl } from './ui/SegmentedControl';

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl<ThemePreference>
      label="Color theme"
      size="sm"
      value={preference}
      onChange={setPreference}
      options={[
        { value: 'light', label: <Sun size={14} aria-label="Light" />, title: 'Light' },
        { value: 'dark', label: <Moon size={14} aria-label="Dark" />, title: 'Dark' },
        { value: 'system', label: <Monitor size={14} aria-label="System" />, title: 'System' },
      ]}
    />
  );
}
