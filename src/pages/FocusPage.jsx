import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui'
import Pomodoro from './Pomodoro'
import ForestPage from './ForestPage'
import s from './FocusPage.module.css'

const FOCUS_VIEWS = ['timer', 'forest']

export default function FocusPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const view = FOCUS_VIEWS.includes(requestedView) ? requestedView : 'timer'

  const handleViewChange = (next) => {
    if (!FOCUS_VIEWS.includes(next)) return
    setSearchParams(prev => {
      const n = new URLSearchParams(prev)
      n.set('view', next)
      return n
    }, { replace: true })
  }

  return (
    <div className={s.page}>
      <Tabs value={view} onValueChange={handleViewChange}>
        <TabsList aria-label="Focus views">
          <TabsTrigger value="timer">Timer</TabsTrigger>
          <TabsTrigger value="forest">Forest</TabsTrigger>
        </TabsList>
        <TabsContent value="timer" forceMount>
          <Pomodoro activePane={view === 'timer'} />
        </TabsContent>
        <TabsContent value="forest">
          <ForestPage />
        </TabsContent>
      </Tabs>
    </div>
  )
}
