/** Contestant looks: each frog differs by colour AND accessory, so colour is never the only cue. */
export interface Look {
  name: string;
  body: string;
  shade: string;
  belly: string;
  accessory: 'bandana' | 'crown' | 'flower' | 'shades';
  accessoryLabel: string;
}

export const LOOKS: Look[] = [
  { name: 'Moss', body: '#62c04b', shade: '#3e8a33', belly: '#d4efa8', accessory: 'bandana', accessoryLabel: 'red bandana' },
  { name: 'Lily', body: '#48a6e0', shade: '#2a6f9f', belly: '#d3ecfa', accessory: 'crown', accessoryLabel: 'gold crown' },
  { name: 'Sunny', body: '#f2c53d', shade: '#b48a1c', belly: '#fff3c4', accessory: 'flower', accessoryLabel: 'pink flower' },
  { name: 'Ink', body: '#a77ce0', shade: '#6c49a3', belly: '#ebdcfb', accessory: 'shades', accessoryLabel: 'sunglasses' },
];
