export function LifeLoginForm({ nextPath = '/' }: { nextPath?: string }) {
  return (
    <form action="/api/admin/login" className="life-login-form" method="post">
      <input type="hidden" name="nextPath" value={nextPath} />
      <label className="field">
        <span>Password</span>
        <input
          className="text-input"
          name="password"
          type="password"
          required
        />
      </label>
      <button className="primary-button" type="submit">Enter</button>
    </form>
  )
}
