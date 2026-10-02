# Development Structure

For a **large-scale React Native production app**, the goal is to optimize for:

* Scalability (many features, developers)
* Clear ownership of code
* Easy testing
* Reusability
* Separation of business logic from UI

A **feature-based architecture** is generally preferred over organizing by file type (`screens`, `components`, `hooks`, etc.) once the app becomes large.

## Recommended Structure

```text
src/
│
├── app/
│   ├── navigation/
│   ├── providers/
│   ├── store/
│   ├── theme/
│   └── App.tsx
│
├── features/
│   ├── auth/
│   │   ├── api/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── screens/
│   │   ├── services/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   │
│   ├── profile/
│   │   ├── api/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── hooks/
│   │   └── index.ts
│   │
│   └── home/
│       ├── api/
│       ├── components/
│       ├── screens/
│       └── index.ts
│
├── shared/
│   ├── components/
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Modal/
│   │   └── index.ts
│   │
│   ├── hooks/
│   ├── services/
│   ├── utils/
│   ├── constants/
│   ├── types/
│   └── validators/
│
├── assets/
│   ├── images/
│   ├── icons/
│   ├── fonts/
│   └── animations/
│
├── config/
│   ├── env.ts
│   ├── api.ts
│   └── featureFlags.ts
│
├── localization/
│   ├── en/
│   ├── fr/
│   └── index.ts
│
└── tests/
    ├── mocks/
    ├── integration/
    └── e2e/
```

---

## Enterprise-Scale Variant

For very large apps (50+ screens, multiple teams), use a layered architecture:

```text
src/
│
├── app/
│
├── modules/
│   ├── auth/
│   ├── payments/
│   ├── orders/
│   ├── chat/
│   └── notifications/
│
├── shared/
│
├── infrastructure/
│   ├── api/
│   ├── storage/
│   ├── analytics/
│   ├── logging/
│   └── monitoring/
│
├── domain/
│   ├── user/
│   ├── order/
│   ├── payment/
│   └── entities/
│
└── presentation/
```

This resembles **Clean Architecture** and works well when multiple teams own separate domains.

---

## Example Feature Module

```text
features/
└── auth/
    ├── api/
    │   ├── login.ts
    │   └── register.ts
    │
    ├── components/
    │   ├── LoginForm.tsx
    │   └── SocialLogin.tsx
    │
    ├── hooks/
    │   ├── useLogin.ts
    │   └── useRegister.ts
    │
    ├── screens/
    │   ├── LoginScreen.tsx
    │   └── RegisterScreen.tsx
    │
    ├── store/
    │   └── authSlice.ts
    │
    ├── types/
    │   └── auth.types.ts
    │
    ├── utils/
    │   └── validation.ts
    │
    └── index.ts
```

Feature code stays together instead of being scattered across global folders.

---

## State Management Structure

With Redux Toolkit:

```text
app/
└── store/
    ├── index.ts
    ├── rootReducer.ts
    └── middleware.ts

features/
├── auth/store/authSlice.ts
├── profile/store/profileSlice.ts
└── cart/store/cartSlice.ts
```

With Zustand:

```text
features/
├── auth/store/useAuthStore.ts
├── cart/store/useCartStore.ts
└── profile/store/useProfileStore.ts
```

Keep state close to the feature that owns it.

---

## Navigation Structure

```text
app/navigation/
├── RootNavigator.tsx
├── AuthNavigator.tsx
├── MainNavigator.tsx
└── types.ts
```

For very large apps:

```text
features/
├── auth/navigation/
├── profile/navigation/
└── orders/navigation/
```

Each feature exports its own navigator.

---

## Shared Components Rule

Place a component in `shared/components` only if:

✅ Used by multiple features

```text
shared/components/Button
shared/components/Input
shared/components/Loader
```

Keep feature-specific components inside the feature:

```text
features/orders/components/OrderCard
features/chat/components/MessageBubble
```

---

## Barrel Exports

Use `index.ts` files:

```ts
// features/auth/index.ts

export * from './screens/LoginScreen';
export * from './hooks/useLogin';
```

Usage:

```ts
import { LoginScreen } from '@/features/auth';
```

---

## Path Aliases

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@app/*": ["src/app/*"],
      "@features/*": ["src/features/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
```

Usage:

```ts
import { Button } from '@shared/components';
import { useAuthStore } from '@features/auth/store';
```

---

## What Many Production Teams Use

A common setup at companies building large React Native apps:

```text
src/
├── app/
├── features/
├── shared/
├── assets/
├── config/
└── tests/
```

This **feature-first architecture** tends to scale better than the traditional:

```text
screens/
components/
hooks/
services/
utils/
```

approach because related code stays together, making ownership, refactoring, and onboarding significantly easier as the codebase grows.
