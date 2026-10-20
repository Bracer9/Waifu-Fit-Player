import { ARM_DIRECTIONS, ARM_HANDS, arrow, noteColor, type ArmHand } from '../model';
import { NoteGlyph } from './Glyph';

export function ArmActionPicker({
  value,
  hand,
  onChange,
  label,
}: {
  value: string;
  hand: ArmHand;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="arms-action-picker" role="group" aria-label={label}>
      <div className="arms-compass">
        {ARM_DIRECTIONS.map((direction, index) => (
          <button
            key={direction}
            aria-label={`${label} ${arrow[direction]}`}
            aria-pressed={value === direction}
            title={arrow[direction]}
            style={
              {
                '--lane': noteColor('punch', direction, hand, 'reach'),
                gridArea: `${Math.floor((index < 4 ? index : index + 1) / 3) + 1} / ${((index < 4 ? index : index + 1) % 3) + 1}`,
              } as React.CSSProperties
            }
            onClick={() => onChange(direction)}
          >
            <NoteGlyph lane="punch" direction={direction} armAction="reach" size={22} />
          </button>
        ))}
        <button
          className="compass-center"
          aria-label={`${label} 双臂展开`}
          aria-pressed={value === 'spread'}
          title="双臂向两侧展开 · 左手向左，右手向右"
          style={{ '--lane': 'var(--arms-both)' } as React.CSSProperties}
          onClick={() => onChange('spread')}
        >
          <NoteGlyph lane="punch" direction="left" armAction="reach" pairedReach size={22} />
        </button>
      </div>
      <div className="arms-gloves">
        {(['left', 'right'] as const).map((direction) => (
          <button
            key={direction}
            aria-label={`${label} PUNCH ${direction === 'left' ? 'L' : 'R'}`}
            aria-pressed={value === `punch-${direction}`}
            title={`${direction === 'left' ? 'J' : 'K'} · PUNCH ${direction === 'left' ? 'L' : 'R'}`}
            style={{ '--lane': noteColor('punch', direction) } as React.CSSProperties}
            onClick={() => onChange(`punch-${direction}`)}
          >
            <NoteGlyph lane="punch" direction={direction} armAction="punch" size={30} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function ArmHandPicker({
  value,
  onChange,
  label,
  feet = false,
  disabled = false,
}: {
  value: ArmHand;
  onChange: (hand: ArmHand) => void;
  label: string;
  feet?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="arm-hands" role="group" aria-label={label}>
      {ARM_HANDS.filter((hand) => !feet || hand.value === 'left' || hand.value === 'right').map(
        (hand) => (
          <button
            key={hand.value}
            aria-label={`${label} ${hand.label}`}
            aria-pressed={value === hand.value}
            disabled={disabled}
            style={{ '--hand': hand.color } as React.CSSProperties}
            onClick={() => onChange(hand.value)}
          >
            {hand.label}
          </button>
        ),
      )}
    </div>
  );
}
