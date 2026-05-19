import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "@/shared/auth-context";

import { homeRouteForRole } from "@/shared/auth-routes";

import { routes } from "@/shared/routes";

import styles from "./RoleSelectPage.module.css";



const ROLE_TITLE: Record<string, string> = {

  student: "Ученик",

  teacher: "Учитель",

  admin: "Администратор",

};



/**

 * Legacy route: role is fixed by the database after login.

 * This page only offers a way back to the home for the current role.

 */

export function RoleSelectPage() {

  const { isAuthenticated, userRole } = useAuth();

  const navigate = useNavigate();



  if (!isAuthenticated || !userRole) {

    return <Navigate to={routes.login} replace />;

  }



  const title = ROLE_TITLE[userRole] ?? userRole;



  return (

    <div className={styles.page}>

      <div className={styles.inner}>

        <header className={styles.header}>

          <h1 className={styles.title}>Ваша роль</h1>

          <p className={styles.subtitle}>

            Доступ определяется учётной записью: <strong>{title}</strong>

          </p>

        </header>



        <div className={styles.grid} style={{ maxWidth: "28rem", margin: "0 auto" }}>

          <article className={styles.card}>

            <div className={styles.cardContent}>

              <p className={styles.cardDescription}>

                Переключение ролей недоступно. Используйте кнопку ниже, чтобы

                вернуться в свою рабочую область.

              </p>

            </div>

            <div className={styles.cardFooter}>

              <button

                type="button"

                className={styles.continueBtn}

                onClick={() => navigate(homeRouteForRole(userRole), { replace: true })}

              >

                Продолжить

              </button>

            </div>

          </article>

        </div>

      </div>

    </div>

  );

}

