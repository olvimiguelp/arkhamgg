import React, { useState, useEffect } from 'react';

export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('pushstate', handleLocationChange);
    window.addEventListener('replacestate', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('pushstate', handleLocationChange);
      window.removeEventListener('replacestate', handleLocationChange);
    };
  }, []);

  return pathname;
}

export function useRouter() {
  return {
    push: (href: string) => {
      window.history.pushState(null, '', href);
      window.dispatchEvent(new Event('pushstate'));
    },
    replace: (href: string) => {
      window.history.replaceState(null, '', href);
      window.dispatchEvent(new Event('replacestate'));
    }
  };
}

export function navigate(href: string) {
  window.history.pushState(null, '', href);
  window.dispatchEvent(new Event('pushstate'));
}

export function Link({
  href,
  children,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  [key: string]: any;
}) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Check if middle click or modifier keys are pressed (e.g. Command/Ctrl click should open in new tab)
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      window.history.pushState(null, '', href);
      window.dispatchEvent(new Event('pushstate'));
    }
  };

  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}
