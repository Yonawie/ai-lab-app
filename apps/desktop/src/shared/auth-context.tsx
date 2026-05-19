import {

  createContext,

  useCallback,

  useContext,

  useMemo,

  useState,

  type ReactNode,

} from "react";



export type UserRole = "student" | "teacher" | "admin";



export type AuthSession = {

  userId: string;

  userEmail: string;

  userRole: UserRole;

};



type AuthContextValue = {

  isAuthenticated: boolean;

  /** Canonical email from the database after login. */

  userEmail: string | null;

  userId: string | null;

  userRole: UserRole | null;

  /** Sets session from DB-backed resolver only (id, email, role). */

  login: (session: AuthSession) => void;

  logout: () => void;

};



const AuthContext = createContext<AuthContextValue | null>(null);



export function AuthProvider({ children }: { children: ReactNode }) {

  const [isAuthenticated, setAuthenticated] = useState(false);

  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<UserRole | null>(null);



  const login = useCallback((session: AuthSession) => {

    setUserId(session.userId);

    setUserEmail(session.userEmail.trim() || null);

    setUserRole(session.userRole);

    setAuthenticated(true);

  }, []);



  const logout = useCallback(() => {

    setAuthenticated(false);

    setUserEmail(null);

    setUserId(null);

    setUserRole(null);

  }, []);



  const value = useMemo(

    () => ({

      isAuthenticated,

      userEmail,

      userId,

      userRole,

      login,

      logout,

    }),

    [isAuthenticated, userEmail, userId, userRole, login, logout],

  );



  return (

    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>

  );

}



export function useAuth() {

  const ctx = useContext(AuthContext);

  if (!ctx) {

    throw new Error("useAuth must be used within AuthProvider");

  }

  return ctx;

}

