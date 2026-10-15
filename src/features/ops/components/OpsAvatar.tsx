// Círculo con las iniciales de una persona (color estable según su id).
import type { CSSProperties } from 'react';
import { colorFor, initials } from '../opsOptions';
import './OpsAvatar.css';

interface OpsAvatarProps {
  id: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export default function OpsAvatar({ id, name, size = 'sm' }: OpsAvatarProps) {
  return (
    <span
      className={`ops-avatar ${size}`}
      style={{ '--av-color': colorFor(id) } as CSSProperties}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
