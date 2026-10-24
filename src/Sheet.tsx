import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from './theme';

export type SheetOption = {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

/** Bottom menu with any number of options (Android alerts allow only three buttons). */
export function Sheet({ visible, title, options, onClose }: { visible: boolean; title?: string; options: SheetOption[]; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {title && <Text style={styles.title}>{title}</Text>}
          <ScrollView style={{ maxHeight: 420 }}>
            {options.map((o, i) => {
              const color = o.destructive ? colors.danger : colors.text;
              return (
                <Pressable
                  key={`${o.label}-${i}`}
                  style={({ pressed }) => [styles.option, pressed && styles.pressed]}
                  onPress={() => {
                    onClose();
                    o.onPress();
                  }}
                >
                  {o.icon && <Ionicons name={o.icon} size={20} color={color} />}
                  <Text style={[styles.optionText, { color }]}>{o.label}</Text>
                  {o.selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={[styles.option, styles.cancel]} onPress={onClose}>
            <Text style={[styles.optionText, { color: colors.muted, textAlign: 'center' }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Asks for a name (e.g. a new album). Mount it with a `key` to reset the text. */
export function NamePrompt({
  visible,
  title,
  initial = '',
  confirmLabel = 'Save',
  onSubmit,
  onClose,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  confirmLabel?: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const ok = name.trim().length > 0;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={styles.center}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            placeholder="Album name"
            placeholderTextColor={colors.dim}
            style={styles.input}
            maxLength={40}
            onSubmitEditing={() => ok && onSubmit(name.trim())}
          />
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={{ color: colors.muted, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.primary, !ok && { opacity: 0.5 }]} disabled={!ok} onPress={() => onSubmit(name.trim())}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 10, paddingBottom: 18 },
  title: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, paddingVertical: 10 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14 },
  optionText: { flex: 1, fontSize: 16 },
  cancel: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: 6 },
  pressed: { backgroundColor: colors.border },
  center: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.card, borderRadius: 20, paddingBottom: 14 },
  input: { marginHorizontal: 20, marginBottom: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 20 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  primary: { backgroundColor: colors.accent },
});
