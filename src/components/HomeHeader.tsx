// ⭐ Encabezado de las vistas Owner y Manager: marca, saludo y fecha. Entre
//    Owner y Manager se cambia con el menú lateral (ya no hay selector arriba
//    a la derecha, pedido del usuario 10/2026).
import MenuButton from '../shared/components/MenuButton';

interface HomeHeaderProps {
  title: string;
  subtitle: string;
  onOpenMenu: () => void;
}

export default function HomeHeader({ title, subtitle, onOpenMenu }: HomeHeaderProps) {
  return (
    <header className="hm-header">
      <div className="hm-header-left view-header-title-group">
        <MenuButton onClick={onOpenMenu} />
        <div className="hm-header-text">
          <p className="hm-eyebrow">Precise Cleaning</p>
          <h1 className="hm-title">{title}</h1>
          <p className="hm-subtitle">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}
