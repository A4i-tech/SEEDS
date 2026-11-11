import { Avatar } from '@mantine/core';
import classes from './UserAvatar.module.css';

export function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <Avatar className={classes.avatar} radius="xl" size={size}>
      {name.trim().charAt(0).toUpperCase()}
    </Avatar>
  );
}
