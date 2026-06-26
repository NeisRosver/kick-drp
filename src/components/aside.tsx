import {
  LuInfo,
  LuSettings,
  LuHouse 
} from "react-icons/lu";
import { Page } from "../context/navigationContext";
import { useNavigation } from "../context/navigationContext";



export function Aside() {
    const { page, setPage } = useNavigation();

    return (
        <aside className="relative w-40 border-r border-white/10 bg-[linear-gradient(180deg,rgba(16,39,24,0.95),rgba(12,14,18,0.95))] p-4">
            <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] bg-[size:24px_24px]" />
            <nav className="flex flex-col relative z-10 mt-10 space-y-3 text-sm text-white/65">
                <MenuItem onClick={() => setPage(Page.HOME)} active={page === Page.HOME} icon={<LuHouse  size={18} />} label="Home" />
                <MenuItem onClick={() => setPage(Page.SETTINGS)} active={page === Page.SETTINGS} icon={<LuSettings size={18} />} label="Settings" />
                <MenuItem onClick={() => setPage(Page.ABOUT)} active={page === Page.ABOUT} icon={<LuInfo size={18} />} label="About" />
            </nav>
        </aside>
    )
}

function MenuItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
        type="button"
        onClick={onClick}
        className={[
            "flex items-center gap-3 rounded-xl px-3 py-3",
            active
            ? "border-l-4 border-[#53fc18] bg-[#53fc18]/10 text-white"
            : "hover:bg-white/5",
      ].join(" ")}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}