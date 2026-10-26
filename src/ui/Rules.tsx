import { WIN_TARGETS } from '../engine/rules'

export function Rules({ open = false }: { open?: boolean }) {
  return (
    <details className="rules" open={open}>
      <summary>Règles</summary>
      <ul>
        <li>À son tour, chaque joueur pose une gemme sur l'intersection libre de son choix, bords compris.</li>
        <li>
          <strong>Gober :</strong> encadrez exactement deux gemmes d'un même adversaire, côte à côte sur une
          ligne, pour les gober. Une gemme posée entre deux gemmes adverses ne se fait pas gober.
        </li>
        <li>
          <strong>Gagner :</strong> une ligne de 6, ou assez de lignes de 5 ou de 4, ou assez de gemmes
          gobées. Une ligne compte seulement pour sa longueur exacte (une ligne de 5 n'est pas une ligne
          de 4), et une ligne coupée par une capture ne compte plus.
        </li>
        <li>Chaque joueur a 50 gemmes ; un joueur qui n'en a plus passe son tour.</li>
      </ul>
      <table className="targets">
        <thead>
          <tr>
            <th>Joueurs</th>
            {Object.keys(WIN_TARGETS).map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lignes de 6</td>
            {Object.keys(WIN_TARGETS).map((n) => (
              <td key={n}>1</td>
            ))}
          </tr>
          <tr>
            <td>Lignes de 5</td>
            {Object.values(WIN_TARGETS).map((t, i) => (
              <td key={i}>{t.five}</td>
            ))}
          </tr>
          <tr>
            <td>Lignes de 4</td>
            {Object.values(WIN_TARGETS).map((t, i) => (
              <td key={i}>{t.four}</td>
            ))}
          </tr>
          <tr>
            <td>Gobées</td>
            {Object.values(WIN_TARGETS).map((t, i) => (
              <td key={i}>{t.captured}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </details>
  )
}
