'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { LifeCommandClient } from '@/components/life/LifeCommandClient'
import { LifeInlineSearch } from '@/components/life/LifeInlineSearch'

interface NavLeaf {
  href: string
  label: string
}

const LIFE_NAV_GROUPS: Array<{ label: string; leaves: NavLeaf[] }> = [
  {
    label: 'Workspace',
    leaves: [
      { href: '/', label: 'Today' },
      { href: '/tasks', label: 'Tasks' },
      { href: '/projects', label: 'Projects' },
      { href: '/people', label: 'People' },
      { href: '/studio', label: 'Studio' },
    ],
  },
  {
    // Its own group: this is the phone tab bar as well as the desktop nav, so
    // Calendar has to stay a peer of Workspace and Library. One leaf now that
    // the calendar carries its own month/week/day/agenda switcher.
    label: 'Calendar',
    leaves: [{ href: '/month', label: 'Calendar' }],
  },
  {
    label: 'Library',
    leaves: [
      { href: '/report', label: 'Reports' },
      { href: '/history', label: 'Entries' },
    ],
  },
]

function isLeafActive(href: string, pathname: string) {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`)
}

export function LifeHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpenGroup, setMobileOpenGroup] = useState<string | null>(null)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const activeGroup =
    LIFE_NAV_GROUPS.find((group) => group.leaves.some((leaf) => isLeafActive(leaf.href, pathname))) ||
    LIFE_NAV_GROUPS[0]
  const mobileMenuGroup = LIFE_NAV_GROUPS.find((group) => group.label === mobileOpenGroup) || null

  useEffect(() => {
    setMobileOpenGroup(null)
    setMobileSearchOpen(false)
    setOpenMenu(null)
  }, [pathname])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [])

  function onMobileGroupPress(label: string, href: string) {
    setMobileSearchOpen(false)
    const group = LIFE_NAV_GROUPS.find((item) => item.label === label)
    if (group?.leaves.length === 1) {
      setMobileOpenGroup(null)
      router.push(href)
      return
    }
    // A section button reveals its destinations first. Navigating straight to
    // the first leaf made Workspace/Library feel like links instead of menus
    // and caused the bottom bar to jump before a destination was chosen.
    setMobileOpenGroup((current) => (current === label ? null : label))
  }

  return (
    <header className="life-header">
      <div className="life-header-top">
        <Link className="brand" href="/">
          LIFE_
        </Link>

        <nav
          ref={navRef}
          className="life-nav-bar life-desktop-nav"
          aria-label="Life"
        >
          {LIFE_NAV_GROUPS.map((group) => {
            const isGroupActive = group.leaves.some((leaf) => isLeafActive(leaf.href, pathname))
            const onlyLeaf = group.leaves.length === 1 ? group.leaves[0] : null
            const isOpen = openMenu === group.label
            if (onlyLeaf) {
              return (
                <div key={group.label} className="life-nav-bar-item">
                  <Link
                    href={onlyLeaf.href}
                    className={`life-nav-bar-trigger life-nav-bar-direct${isGroupActive ? ' group-active' : ''}`}
                    onMouseEnter={() => setOpenMenu(null)}
                  >
                    {group.label}
                  </Link>
                </div>
              )
            }
            return (
              <div key={group.label} className="life-nav-bar-item">
                <button
                  type="button"
                  className={[
                    'life-nav-bar-trigger',
                    isOpen ? 'open' : '',
                    isGroupActive ? 'group-active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setOpenMenu(isOpen ? null : group.label)}
                  onMouseEnter={() => { if (openMenu) setOpenMenu(group.label) }}
                >
                  {group.label}
                </button>
                {isOpen && (
                  <div className="life-nav-bar-menu">
                    {group.leaves.map((leaf) => (
                      <Link
                        key={leaf.href}
                        href={leaf.href}
                        className={`life-nav-bar-link${isLeafActive(leaf.href, pathname) ? ' active' : ''}`}
                      >
                        {leaf.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <LifeCommandClient />

        <LifeInlineSearch
          isOpen={mobileSearchOpen}
          onOpen={() => {
            setMobileOpenGroup(null)
            setMobileSearchOpen(true)
          }}
          onClose={() => setMobileSearchOpen(false)}
        />
      </div>

      <nav className="life-bottom-nav" aria-label="Life mobile">
        <div className="life-bottom-nav-groups">
          {LIFE_NAV_GROUPS.map((group) => (
            <button
              key={group.label}
              type="button"
              className={`life-bottom-nav-link${group === activeGroup ? ' active' : ''}`}
              aria-expanded={mobileOpenGroup === group.label}
              onClick={() => onMobileGroupPress(group.label, group.leaves[0].href)}
            >
              {group.label}
            </button>
          ))}
        </div>
        {mobileMenuGroup && mobileMenuGroup.leaves.length > 1 ? (
          <nav className="life-bottom-subnav" aria-label={`${mobileMenuGroup.label} views`}>
            {mobileMenuGroup.leaves.map((leaf) => (
              <Link
                key={leaf.href}
                href={leaf.href}
                className={`life-bottom-subnav-link${isLeafActive(leaf.href, pathname) ? ' active' : ''}`}
              >
                {leaf.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </nav>
    </header>
  )
}
