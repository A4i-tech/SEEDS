
import AllContent from './components/AllContent';
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ContentDetails from "./components/ContentDetails";
import ContentEdit from "./components/ContentEdit";
import AddContent from './components/AddContent';
import BulkCallInitiator from './components/BulkCallInitiator';
import IVR from './components/IVR';
import ViewIVR from './components/ViewIVR';
import './App.css'
import Login from './components/Login';
import ApiDocumentation from './components/ApiDocumentation';


function App() {
  
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<Login />}></Route>
          <Route path='/content' element={<AllContent />}/>
          <Route path='/content/create' element={<AddContent />}/>
          <Route path='/content/detail/:type/:id' element={<ContentDetails />}/>
          <Route path='/content/edit/:type/:id' element={<ContentEdit />}/>
          <Route path ='/ivr' element={<IVR />}/>
          <Route path = '/viewivr' element={<ViewIVR />}/>
          <Route path = '/bulkcall' element={<BulkCallInitiator />}/>
          <Route path = '/api-docs' element={<ApiDocumentation />}/>

        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
