export interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  emojis: string[];
}

const split = (s: string) => [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment).filter((x) => x.trim());

/**
 * Seleção de emojis por categoria (os mais usados em conversas), sem depender de biblioteca externa.
 * Só versões até Emoji 12: as mais novas aparecem como quadradinho no Windows 10.
 */
export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    label: 'Carinhas',
    icon: '😀',
    emojis: split(
      '😀😃😄😁😆😅😂🤣☺️😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👻💀☠️👽🤖🎃😺😸😹😻😼😽🙀😿😾',
    ),
  },
  {
    id: 'people',
    label: 'Gestos e pessoas',
    icon: '👋',
    emojis: split(
      '👋🤚🖐️✋🖖👌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏✍️💅🤳💪🦾🦵🦶👂🦻👃🧠🦷🦴👀👁️👅👄👶🧒👦👧🧑👱👨🧔👩🧓👴👵🙋🙆🙅🤷🤦💁🙇👮🕵️💂👷🤴👸👳🧕🤵👰🤰🤱👼🎅🤶🦸🦹🧙🧚🧛🧜🧝🧞🧟💃🕺👯🧖🧘👫👭👬💏💑👪',
    ),
  },
  {
    id: 'hearts',
    label: 'Corações e símbolos',
    icon: '❤️',
    emojis: split(
      '❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝💟☮️✝️☯️🕉️☸️✡️🔯☪️🛐⛎♈♉♊♋♌♍♎♏♐♑♒♓🆗🆒🆕🆓✅☑️✔️❌❎➕➖➗✖️💯🔥✨⭐🌟💫💥💢💦💨🕳️💬👁️‍🗨️🗨️🗯️💭💤🎶🎵⚠️🚫⛔📛🔞❗❓❕❔‼️⁉️🔴🟠🟡🟢🔵🟣⚫⚪🟤',
    ),
  },
  {
    id: 'nature',
    label: 'Animais e natureza',
    icon: '🐶',
    emojis: split(
      '🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🙈🙉🙊🐔🐧🐦🐤🦆🦅🦉🦇🐺🐗🐴🦄🐝🐛🦋🐌🐞🐜🐢🐍🦎🐙🦑🦐🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🐘🦛🦏🐪🦒🦘🐃🐄🐎🐖🐑🐐🦌🐕🐩🐈🐓🦃🦚🦜🦢🕊️🐇🦝🦨🦡🦦🦥🐁🐿️🦔🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🎋🍃🍂🍁🍄🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌙🌎🪐💫⭐🌟⚡☄️💥🔥🌪️🌈☀️🌤️⛅🌥️☁️🌦️🌧️⛈️🌩️❄️☃️⛄🌬️💨💧💦☔🌊',
    ),
  },
  {
    id: 'food',
    label: 'Comidas e bebidas',
    icon: '🍕',
    emojis: split(
      '🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🌭🍔🍟🍕🥪🥙🧆🌮🌯🥗🥘🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼☕🍵🧃🥤🍶🍺🍻🥂🍷🥃🍸🍹🧉🍾🧊',
    ),
  },
  {
    id: 'activities',
    label: 'Atividades e objetos',
    icon: '⚽',
    emojis: split(
      '⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🏓🏸🏒🥅⛳🏹🎣🥊🥋🛹⛸️🎿🏂🏋️🤸⛹️🤺🏌️🏇🧘🏄🏊🚴🏆🥇🥈🥉🏅🎖️🎗️🎫🎟️🎪🎭🎨🎬🎤🎧🎼🎹🥁🎷🎺🎸🎻🎲♟️🎯🎳🎮🎰🧩🚗🚕🚌🏎️🚓🚑🚒🛵🏍️🚲✈️🚀🛸🚁⛵🚢🏠🏡🏢🏥🏦🏫⛪🕌🏖️🏝️⛰️🌋🗽🗼🎡🎢📱💻⌨️🖥️🖨️🖱️💾💿📷📸📹🎥📞☎️📺📻⏰⌛💡🔦🕯️💸💵💰💳💎⚖️🔧🔨⚙️🧲🔫💣🔪🛡️🔮💊💉🧬🦠🧹🧺🧻🚽🛁🛎️🔑🗝️🚪🛋️🛏️🧸🎁🎈🎀🎊🎉✉️📩📦📅📆🗓️📋📌📍✂️🖊️✏️📝📚📖🔖🔗📎',
    ),
  },
];
