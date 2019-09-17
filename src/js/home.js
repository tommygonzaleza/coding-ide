import React from 'react';
import logo from '../img/breathecode.png';
import Editor from './components/editor/Editor.js';
import Terminal from './components/terminal/Terminal.js';
import StatusBar from './components/status-bar/StatusBar.js';
import SplitPane from 'react-split-pane';
import { MarkdownParser } from "@breathecode/ui-components";
import Socket, { isPending, getStatus } from './socket';
import { getHost, loadExercises, loadSingleExercise, loadFile, saveFile } from './actions.js';
import Joyride from 'react-joyride';
import { Session } from 'bc-react-session';

const actions = [
    { slug: 'build', label: 'Build', icon: 'fas fa-box-open' },
    { slug: 'run', label: 'Compile', icon: 'fas fa-play' },
    { slug: 'preview', label: 'Preview', icon: 'fas fa-play' },
    { slug: 'pretty', label: 'Pretty', icon: 'fas fa-paint-brush' },
    { slug: 'test', label: 'Test', icon: 'fas fa-check' }
];

//create your first component
export default class Home extends React.Component{
    constructor(){
        super();
        this.state = {
            host: getHost(),
            helpSteps: {
                standalone: [
                    {
                        target: '.bc-readme',
                        content: <span><h4>1) Read!</h4>Every exercise will come with a brief introduction and some instructions on how to complete it.</span>,
                        placement: 'right',
                        disableBeacon: true
                    },
                    {
                        target: '.react-monaco-editor-container',
                        content: <span><h4>2) Code!</h4>Use this coding editor on the right of the screen to code and propose a solution.</span>,
                        placement: 'left'
                    },
                    {
                        target: '.bc-terminal .button-bar',
                        content: <span><h4>3) Compile!</h4>Use the terminal buttons to <code>build</code> and <code>test</code> your exercises solutions.</span>,
                        placement: 'left'
                    },
                    {
                        target: '.bc-terminal .status',
                        content: <span>The console will always display the current state of the code, compilation errors or test results.</span>,
                        placement: 'bottom'
                    },
                    {
                        target: '.next-exercise',
                        content: 'Once you are satisfied with your code solution, you can go ahead to the next exercise.',
                        placement: 'bottom'
                    },
                    {
                        target: 'body',
                        content: <span><h4>4) Deliver!</h4>After finishing all exercises run <code>$ bc deliver:exercises</code> on your command line to deliver the exercises into the breathecode platform.</span>,
                        placement: 'center'
                    }
                ],
                gitpod: [
                    {
                        target: 'body',
                        content: <span><h4>1) Read!</h4>Every exercise will come with a brief introduction and some instructions on how to complete it.</span>,
                        placement: 'center',
                        disableBeacon: true
                    },
                    {
                        target: 'body',
                        placement: 'center',
                        content: <span><h4>2) Code!</h4>Use the gitpod ide on the left of the screen to code and propose a solution.</span>,
                        disableBeacon: true
                    },
                    {
                        target: '.button-bar',
                        content: <span><h4>3) Compile!</h4>Use the terminal buttons to <code>build</code> and <code>test</code> your exercises solutions.</span>,
                        placement: 'bottom'
                    },
                    {
                        target: '.status',
                        content: <span>The console will always display the current state of the code, compilation errors or test results.</span>,
                        placement: 'bottom'
                    },
                    {
                        target: '.next-exercise',
                        content: 'Once you are satisfied with your code solution, you can go ahead to the next exercise.',
                        placement: 'bottom'
                    },
                    {
                        target: 'body',
                        content: <span><h4>4) Deliver!</h4>After finishing all exercises run <code>$ bc deliver:exercises</code> on your command line to deliver the exercises into the breathecode platform.</span>,
                        placement: 'center'
                    }
                ]
            },
            editorSocket: null,
            editorSize: 450,
            editorMode: null,
            codeHasBeenChanged: true,
            exercises: [],
            error: null,
            files: [],
            compilerSocket: null,
            consoleLogs: [],
            consoleStatus: null,
            isSaving: false,
            current: null,
            currentInstructions: null,
            currentFileContent: null,
            currentFileName: null,
            currentFileExtension: null,
            possibleActions: [],
            readme: '',
            getIndex: (slug) => {
                for(let i=0; i<this.state.exercises.length; i++)
                    if(this.state.exercises[i].slug == slug) return i;

                return false;
            },
            next: () => {
                const i = this.state.getIndex(this.state.currentSlug)+1;
                if(typeof(this.state.exercises[i]) != 'undefined') return this.state.exercises[i];
                else return null;
            },
            previous: () => {
                const i = this.state.getIndex(this.state.currentSlug)-1;
                if(typeof(this.state.exercises[i]) != 'undefined') return this.state.exercises[i];
                else return null;
            }
        };
    }
    setEditorConfig(){
        fetch(this.state.host+'/config').then(resp => resp.json()).then(config => {
            this.setState({
                editorMode: config.editor
            });
        });
    }
    componentDidMount(){
        if(this.state.host){
            this.setEditorConfig();
            const session = Session.getSession();
            if(!session.active) Session.start({ payload: { showHelp: true } });
            else if(typeof session.payload.showHelp === 'undefined') Session.setPayload({ showHelp:true });

            loadExercises()
                .then((exercises) => {
                    this.setState({ exercises, error: null });
                    if(!window.location.hash || window.location.hash == '#') this.loadInstructions(exercises[0].slug);
                })
                .catch(error => this.setState({ error: "There was an error loading the excercise list from "+this.state.host }));

            //check for changes on the hash
            window.addEventListener("hashchange", () => this.loadInstructions());
            if(window.location.hash && window.location.hash!='#') this.loadInstructions();

            //connect to the compiler
            Socket.start(this.state.host);
            const compilerSocket = Socket.createScope('compiler');
            compilerSocket.whenUpdated((scope, data) => {
                let state = { consoleLogs: scope.logs, consoleStatus: scope.status, possibleActions: actions.filter(a => data.allowed.includes(a.slug)) };
                if(typeof data.code == 'string') state.currentFileContent = data.code;
                this.setState(state);
            });
            compilerSocket.onStatus('compiler-success', () => {
                loadFile(this.state.currentSlug, this.state.currentFileName)
                    .then(content => this.setState({ currentFileContent: content, codeHasBeenChanged: false }));
            });
            compilerSocket.on("ask", ({ inputs }) => {
                compilerSocket.emit('input', {
                    inputs: inputs.map((question,i) => prompt(question || `Please enter the ${i+1} input`)),
                    exerciseSlug: this.state.currentSlug
                });
            });
            this.setState({ compilerSocket });
        }
    }
    loadInstructions(slug=null){
        if(!slug) slug = window.location.hash.slice(1,window.location.hash.length);
        if(slug=='' || slug=='/'){
            this.state.next();
        }
        else{
            loadSingleExercise(slug)
                .then(files => {
                    this.setState({
                        files,
                        currentSlug: slug,
                        consoleLogs: [],
                        codeHasBeenChanged: true,
                        consoleStatus: { code: 'ready', message: getStatus('ready') }
                    });
                    if(files.length > 0) loadFile(slug, files[0].name).then(content => this.setState({
                        currentFileContent: content,
                        currentFileName: files[0].name,
                        possibleActions: this.state.possibleActions.filter(a => a.slug !== 'preview'),
                        currentFileExtension: files[0].name.split('.').pop()
                    }));
                })
                .catch(error => this.setState({ error: "There was an error loading the exercise: "+slug }));
            loadFile(slug,'README.md').then(readme => this.setState({ readme }));
        }
    }
    render(){
        const { showHelp } = Session.getPayload();
        if(!this.state.host) return (<div className="alert alert-danger text-center"> ⚠️ No host specified for the application</div>);
        if(this.state.error) return <div className="alert alert-danger">{this.state.error}</div>;
        const size = {
            vertical: {
                min: 50,
                init: 550
            },
            horizontal: {
                min: 50,
                init: 450
            }
        };

        const LeftSide = (p) => (<div className={p.className} style={{ paddingBottom: this.state.editorMode === "gitpod" ? "55px" : "0"}}>
            { this.state.helpSteps[this.state.editorMode] && <Joyride
                    steps={this.state.helpSteps[this.state.editorMode]}
                    continuous={true}
                    run={showHelp === true && this.state.getIndex(this.state.currentSlug) === 1}
                    locale={{ back: 'Previous', close: 'Close', last: 'Finish', next: 'Next' }}
                    styles={{
                        options: {
                            backgroundColor: '#FFFFFF',
                            overlayColor: 'rgba(0, 0, 0, 0.9)'
                        }
                    }}
                    callback = {(tour) => {
                        const { type } = tour;
                        if (type === 'tour:end') {
                            Session.setPayload({ showHelp: false });
                        }
                    }}
                />
            }
            <div className={"credits "+p.creditsPosition}>
                <img className={"bclogo"} src={logo} />
                <span>Made with love <br/> by <a href="https://breatheco.de" target="_blank" rel="noopener noreferrer">BreatheCode</a></span>
            </div>
            <div className="prev-next-bar">
                {(this.state.previous()) ? <a className="prev-exercise" href={"#"+this.state.previous().slug}>Previous</a>:''}
                {(this.state.next()) ? <a className="next-exercise" href={"#"+this.state.next().slug}>Next</a>:''}
            </div>
            <MarkdownParser className="markdown" source={this.state.currentInstructions ? this.state.currentInstructions : this.state.readme} />
        </div>);

        if(this.state.files.length == 0) return <LeftSide creditsPosition="bottom-center" />;

        return this.state.editorMode === "standalone" ?
            <SplitPane split="vertical" minSize={size.vertical.min} defaultSize={size.vertical.init}>
                <LeftSide creditsPosition="top-right" />
                <div>
                    <SplitPane split="horizontal"
                        minSize={size.horizontal.min}
                        defaultSize={size.horizontal.init}
                        onChange={ size => this.setState({editorSize: size}) }
                    >
                        <Editor
                            files={this.state.files}
                            language={this.state.currentFileExtension}
                            buffer={this.state.currentFileContent}
                            onOpen={(fileName) => loadFile(this.state.currentSlug,fileName).then(content => this.setState({ currentFileContent: content, currentFileName: fileName.name, currentFileExtension: fileName.name.split('.').pop() })) }
                            showStatus={true}
                            onIdle={() => {
                                saveFile(this.state.currentSlug, this.state.currentFileName, this.state.currentFileContent)
                                            .then(status => this.setState({ isSaving: false, consoleLogs: ['Your code has been saved successfully.', 'Ready to compile...'] }))
                                            .catch(error => this.setState({ isSaving: false, consoleLogs: ['There was an error saving your code.'] }));
                            }}
                            height={this.state.editorSize}
                            onChange={(content) => this.setState({
                                currentFileContent: content,
                                codeHasBeenChanged: true,
                                isSaving: true,
                                consoleLogs: [],
                                consoleStatus: { code: 'ready', message: getStatus('ready') }
                            })}
                        />
                        <Terminal
                            mode={this.state.editorMode}
                            disabled={isPending(this.state.consoleStatus) || this.state.isSaving}
                            host={this.state.host}
                            status={this.state.isSaving ? { code: 'saving', message: getStatus('saving') } : this.state.consoleStatus}
                            logs={this.state.consoleLogs}
                            actions={this.state.possibleActions}
                            onAction={(a) => {
                                if(a.slug === 'preview') window.open(this.state.host+'/preview');
                                else this.state.compilerSocket.emit(a.slug, { exerciseSlug: this.state.currentSlug });
                            }}
                            height={window.innerHeight - this.state.editorSize}
                            exercise={this.state.currentSlug}
                        />
                    </SplitPane>
                </div>
            </SplitPane>
            :
            <div>
                <StatusBar
                    actions={this.state.possibleActions}
                    status={this.state.consoleStatus}
                    disabled={isPending(this.state.consoleStatus)}
                    onAction={(a) => {
                        if(a.slug === 'preview') window.open(this.state.host+'/preview');
                        else this.state.compilerSocket.emit(a.slug, { exerciseSlug: this.state.currentSlug });
                    }}
                />
                <LeftSide creditsPosition="bottom-center" />
            </div>;
    }
}

/*
    onPrettify={() => this.state.compilerSocket.emit('prettify', {
        fileName: this.state.currentFileName,
        exerciseSlug: this.state.currentSlug
    })}
*/