import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import { initializeAppearance } from '@/services/appearance';

initializeAppearance();

createApp(App).mount('#app');
