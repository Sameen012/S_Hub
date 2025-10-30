// **** IMPORTANT ****
// This URL is for local development in VS Code.
// Make sure it matches the port in your server.js (e.g., 3001)
const API_BASE_URL = 'http://localhost:3002';

// This object holds the lesson content for each course.
// You can add as many steps (lessons) as you want here.
const COURSE_CONTENT = {
    '1': { // Corresponds to Course ID 1 (Graphic Design)
        steps: [
            { id: 1, title: 'Introduction to Graphic Design', description: 'Learn the fundamentals of graphic design and its importance in modern communication.', videoUrl: 'https://www.youtube.com/embed/ViOZmtLvbXI' },
            { id: 2, title: 'Typography Basics', description: 'Explore the art and technique of arranging type to make written language legible and appealing.', videoUrl: 'https://www.youtube.com/embed/QrNi9FmdlxY' },
            { id: 3, title: 'Color Theory Essentials', description: 'Understanding color relationships and how to use them effectively in design.', videoUrl: 'https://www.youtube.com/embed/Co6b_v8M_S8' },
            { id: 4, title: 'Layout & Composition', description: 'Master the principles of visual hierarchy and composition in design.', videoUrl: 'https://www.youtube.com/embed/a5KYl8J-9sE' },
            { id: 5, title: 'Getting Started with Canva', description: 'Learn to use Canva for creating professional designs quickly and easily.', videoUrl: 'https://www.youtube.com/embed/CFwF6YqT1K0' }
        ]
    },
    '2': { // Corresponds to Course ID 2 (Basic Computer Course)
        steps: [
            { id: 1, title: 'What is a Computer?', description: 'Understanding what computers are and their basic components.', videoUrl: 'https://www.youtube.com/embed/AkFi90lZmXA' },
            { id: 2, title: 'Basic Hardware Components', description: 'Learn about the physical parts that make up a computer system.', videoUrl: 'https://www.youtube.com/embed/ExxFxD4OSZ0' },
            { id: 3, title: 'Introduction to Windows', description: 'Learn the basics of using Windows operating system.', videoUrl: 'https://www.youtube.com/embed/w3fSBdleR0E' },
            { id: 4, title: 'File Management Basics', description: 'How to organize and manage your files and folders effectively.', videoUrl: 'https://www.youtube.com/embed/k-EID5_2D9U' },
            { id: 5, title: 'Internet Safety Basics', description: 'Learn essential internet safety and security practices.', videoUrl: 'https://www.youtube.com/embed/sdpxddDzXfE' }
        ]
    },
    '3': { // Corresponds to Course ID 3 (Art Design)
        steps: [
            { id: 1, title: 'Elements of Art', description: 'Learn the basic building blocks of artistic creation.', videoUrl: 'https://www.youtube.com/embed/0SowNTA1FWw' },
            { id: 2, title: 'Art Design Principles', description: 'Understanding how to use the elements of art effectively.', videoUrl: 'https://www.youtube.com/embed/bS1YQIphnEY' },
            { id: 3, title: 'Color Theory for Artists', description: 'Master the use of color in artistic compositions.', videoUrl: 'https://www.youtube.com/embed/mUi7gKbF4HE' },
            { id: 4, title: 'Drawing Basics', description: 'Learn fundamental drawing techniques and practices.', videoUrl: 'https://www.youtube.com/embed/ewMksAbgdBI' },
            { id: 5, title: 'Digital Art Introduction', description: 'Introduction to creating art using digital tools.', videoUrl: 'https://www.youtube.com/embed/8RC5D7nu-YQ' }
        ]
    }
};

// 2. Global variable to hold course data for the YouTube API
let courseDataForPlayer;
// Track progress counts for UI
let completedStepsCount = 0;
let totalStepsCount = 0;
let currentCourseId = null;

// 3. This function is called automatically by the YouTube API script
function onYouTubeIframeAPIReady() {
    if (!courseDataForPlayer || !courseDataForPlayer.steps) return;
    
    // Initialize player for the first step only
    const firstStep = courseDataForPlayer.steps[0];
    if (firstStep) {
        const videoId = firstStep.videoUrl.split('embed/')[1].split('?')[0];
        new YT.Player('player-step-' + firstStep.id, {
            height: '100%',
            width: '100%',
            videoId: videoId,
            playerVars: { 
                'playsinline': 1,
                'rel': 0,            // Don't show related videos
                'modestbranding': 1  // Show minimal YouTube branding
            },
            events: {
                'onStateChange': (e) => onPlayerStateChange(e, firstStep.id)
            }
        });
    }
}

// Initialize YouTube player when showing a new step
function initializeVideoPlayer(step) {
    if (!step || !step.videoUrl) return;

    const container = document.getElementById('player-step-' + step.id);
    if (!container) return;
    container.innerHTML = '';

    // Helper: detect YouTube ID from many URL formats
    function getYouTubeId(url) {
        if (!url) return null;
        // if already embed
        const embedMatch = url.match(/embed\/([a-zA-Z0-9_-]{5,})/);
        if (embedMatch) return embedMatch[1];
        // watch?v= or v= param
        const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{5,})/);
        if (watchMatch) return watchMatch[1];
        // youtu.be short link
        const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{5,})/);
        if (shortMatch) return shortMatch[1];
        return null;
    }

    const videoUrl = step.videoUrl;
    const isUploaded = /\/uploads\//i.test(videoUrl) || /\.(mp4|webm|ogg)$/i.test(videoUrl);
    const ytId = getYouTubeId(videoUrl);

    if (isUploaded) {
        // Use HTML5 video for uploaded files
        const video = document.createElement('video');
        video.controls = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.src = videoUrl;
        video.addEventListener('ended', () => onHTML5VideoEnded(step.id));
        container.appendChild(video);
        return;
    }

    if (ytId && window.YT && window.YT.Player) {
        // Use YouTube Player API
        new YT.Player('player-step-' + step.id, {
            height: '100%',
            width: '100%',
            videoId: ytId,
            playerVars: {
                'playsinline': 1,
                'rel': 0,
                'modestbranding': 1
            },
            events: {
                'onStateChange': (e) => onPlayerStateChange(e, step.id)
            }
        });
        return;
    }

    // Fallback: embed iframe (no API events)
    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    if (ytId) iframe.src = `https://www.youtube.com/embed/${ytId}`;
    else iframe.src = videoUrl; // unknown URL, try embedding directly
    container.appendChild(iframe);
}

function onHTML5VideoEnded(stepId) {
    // Enable the same mark-as-complete button
    const button = document.querySelector('button.complete-btn[data-step-id="' + stepId + '"]');
    if (button) {
        const stepElement = button.closest('.bg-white');
        if (!stepElement.classList.contains('step-completed')) {
            button.disabled = false;
            button.classList.remove('cursor-not-allowed');
            button.classList.add('hover:bg-green-700');
            button.textContent = 'Mark as Complete (Click Now)';
        }
    }
}

function updateLeftListUI() {
    // Update checkmarks next to steps
    const buttons = document.querySelectorAll('#steps-list button');
    buttons.forEach((btn, idx) => {
        const status = btn.querySelector('.step-status');
        if (!status) return;
        if (idx < completedStepsCount) status.textContent = '✅'; else status.textContent = '';
    });
}

function updateGlobalProgressUI() {
    const globalProgressBar = document.getElementById('global-progress');
    if (!globalProgressBar) return;
    const percent = totalStepsCount > 0 ? Math.round((completedStepsCount / totalStepsCount) * 100) : 0;
    globalProgressBar.style.width = percent + '%';
}

// 4. This function listens for player state changes (e.g., video ended)
function onPlayerStateChange(event, stepId) {
    // Check if the video has ended
    if (event.data == YT.PlayerState.ENDED) {
        // Target the mark-as-complete button specifically (not the left-list buttons)
        const button = document.querySelector('button.complete-btn[data-step-id="' + stepId + '"]');
        if (button) {
            // Check if this is the active lesson button (not one already completed)
            const stepElement = button.closest('.bg-white');
            if (!stepElement.classList.contains('step-completed')) {
                button.disabled = false; // <-- ENABLE THE BUTTON
                button.classList.remove('cursor-not-allowed');
                button.classList.add('hover:bg-green-700');
                button.textContent = 'Mark as Complete (Click Now)';
            }
        }
    }
}


document.addEventListener('DOMContentLoaded', async function () {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const courseId = urlParams.get('id');

    if (!courseId) {
        document.querySelector('main').innerHTML = '<h1 class="text-2xl text-red-500">No course specified.</h1>';
        return;
    }

    // Fetch course details and progress from backend
    try {
        const response = await fetch(API_BASE_URL + '/api/course/' + courseId + '/details', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error('Could not fetch course details. Are you enrolled?');
        
        const data = await response.json();
        
        // If the course has a video_url set (admin uploaded or provided), prefer that
        if (data.course && data.course.video_url) {
            // Use the course video as a single-step lesson if no detailed steps exist
            data.steps = [{ id: 1, title: data.course.name, description: data.course.description || '', videoUrl: data.course.video_url }];
        } else {
            // Fallback to the built-in COURSE_CONTENT map
            data.steps = COURSE_CONTENT[courseId]?.steps || [];
        }

        // 5. Assign data to the global variable
        courseDataForPlayer = data;
    // Initialize counters for UI progress
    totalStepsCount = data.steps.length || 0;
    completedStepsCount = Math.floor((data.enrollment.progress / 100) * totalStepsCount);
    currentCourseId = courseId;

    populateCourseDetails(data);
    // setupStepCompletion remains for certificate/download logic
    setupStepCompletion(data);
    // Sync UI with current progress
    updateLeftListUI();
    updateGlobalProgressUI();

        // 6. Manually trigger the API ready function if it's already loaded
        if (window.YT && window.YT.Player) {
            onYouTubeIframeAPIReady();
        }

    } catch (error) {
        document.querySelector('main').innerHTML = '<h1 class="text-2xl text-red-500">Error: ' + error.message + '</h1>';
    }
});

function populateCourseDetails(data) {
    document.getElementById('course-title').textContent = data.course.name;

    // Populate the steps list (left side)
    const stepsList = document.getElementById('steps-list');
    stepsList.innerHTML = ''; // Clear loading state

    if (!data.steps || data.steps.length === 0) {
        stepsList.innerHTML = '<p>Course content is coming soon.</p>';
        return;
    }

    // Create the content list (left side)
    data.steps.forEach((step, index) => {
        const stepButton = document.createElement('button');
        stepButton.className = 'w-full text-left p-3 hover:bg-gray-100 rounded-lg transition-colors flex items-center justify-between';
        stepButton.setAttribute('data-step-id', step.id);
        stepButton.innerHTML = `
            <div class="flex items-center">
                <span class="mr-2">📝</span>
                <span>${step.title}</span>
            </div>
            <div class="step-status">${index < completedStepsCount ? '✅' : ''}</div>
        `;
        stepButton.addEventListener('click', () => showStep(step, data.steps));
        stepsList.appendChild(stepButton);
    });

    // Show the first step by default
    if (data.steps.length > 0) {
        showStep(data.steps[0], data.steps);
    }
}

function showStep(step, allSteps) {
    // Update active step in the list
    document.querySelectorAll('#steps-list button').forEach(btn => {
        btn.classList.remove('bg-blue-50', 'text-blue-600');
        if (parseInt(btn.getAttribute('data-step-id')) === step.id) {
            btn.classList.add('bg-blue-50', 'text-blue-600');
        }
    });

    // Update the video and content area (right side)
    const stepsContainer = document.getElementById('learning-steps');
    stepsContainer.innerHTML = '';

    const stepElement = document.createElement('div');
    stepElement.id = 'step-' + step.id;
    stepElement.className = 'bg-white p-6 rounded-lg shadow-md border-l-4 border-gray-300';
    
    stepElement.innerHTML = `
        <h2 class="text-xl font-bold mb-3">${step.title}</h2>
        <p class="text-gray-600 mb-4">${step.description || ''}</p>
        <div class="aspect-w-16 mb-4">
            <div id="player-step-${step.id}" class="rounded-md w-full h-48 md:h-64"></div>
        </div>
        <div class="flex items-center justify-between mt-4">
            <div class="space-x-2">
                ${step.id > 1 ? `<button class="prev-step-btn bg-gray-200 text-gray-700 px-4 py-2 rounded-full hover:bg-gray-300">Previous</button>` : ''}
                ${step.id < allSteps.length ? `<button class="next-step-btn bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600">Next</button>` : ''}
            </div>
            <button data-step-id="${step.id}" class="complete-btn bg-gray-400 text-white px-4 py-2 rounded-full cursor-not-allowed" disabled>Mark as Complete</button>
        </div>
    `;
    stepsContainer.appendChild(stepElement);
    
    // Initialize the video player for this step
    initializeVideoPlayer(step);

    // Wire up Prev/Next buttons
    const prevBtn = stepElement.querySelector('.prev-step-btn');
    const nextBtn = stepElement.querySelector('.next-step-btn');
    const markBtn = stepElement.querySelector('.complete-btn');

    const currentIndex = allSteps.findIndex(s => s.id === step.id);
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            showStep(allSteps[currentIndex - 1], allSteps);
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            showStep(allSteps[currentIndex + 1], allSteps);
        });
    }

    // Set mark button initial state based on completedStepsCount
    if (markBtn) {
        if (currentIndex < completedStepsCount) {
            markBtn.textContent = 'Completed!';
            markBtn.disabled = true;
            markBtn.classList.remove('bg-gray-400');
            markBtn.classList.add('bg-green-500');
        } else {
            markBtn.textContent = 'Watch Video to Enable';
            markBtn.disabled = true; // will be enabled when video ends
        }

        // Handle manual marking (user clicks "Mark as Complete")
        markBtn.addEventListener('click', async () => {
            if (markBtn.disabled) return;
            // Update local counters
            completedStepsCount = Math.min(totalStepsCount, completedStepsCount + 1);
            const newProgress = Math.round((completedStepsCount / totalStepsCount) * 100);

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_BASE_URL}/api/course/${currentCourseId}/progress`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ progress: newProgress })
                });
                if (!res.ok) throw new Error('Failed to update progress');

                // Update UI
                markBtn.textContent = 'Completed!';
                markBtn.disabled = true;
                markBtn.classList.remove('bg-gray-400');
                markBtn.classList.add('bg-green-500');
                updateLeftListUI();
                updateGlobalProgressUI();
            } catch (err) {
                console.error('Failed to update progress:', err);
            }
        });
    }
}

function setupStepCompletion(data) {
    const completeButtons = document.querySelectorAll('.complete-btn');
    const globalProgressBar = document.getElementById('global-progress');
    const certificate = document.getElementById('certificate');
    const certDate = document.getElementById('cert-date');
    
    // --- Certificate Download Button Logic ---
    const downloadButton = document.getElementById('download-cert');
    downloadButton.addEventListener('click', () => {
        const userName = localStorage.getItem('userName') || 'Valued Student';
        const courseName = data.course.name;
        const completionDate = new Date().toLocaleDateString();
        
        // This is the fixed certificate HTML string
        const certificateHTML = 
            '<html>' +
            '<head>' +
                '<title>Certificate of Completion</title>' +
                '<script src="https://cdn.tailwindcss.com"></script>' +
                '<style>' +
                    '@media print {' +
                        'body { ' +
                            '-webkit-print-color-adjust: exact; ' +
                            'print-color-adjust: exact; ' +
                        '}' +
                        '.no-print { display: none; }' +
                    '}' +
                '</style>' +
            '</head>' +
            '<body class="bg-gray-100 flex items-center justify-center min-h-screen">' +
                '<div class="w-full max-w-4xl mx-auto bg-white p-10 md:p-16 rounded-lg shadow-2xl border-4 border-blue-500"' +
                     'style="background-image: url(\'https://www.transparenttextures.com/patterns/subtle-white-feathers.png\');">' +
                    
                    '<div class="text-center">' +
                        '<h1 class="text-2xl font-bold text-gray-500 uppercase tracking-widest">Certificate of Completion</h1>' +
                        '<p class="text-lg text-gray-600 mt-8">This certificate is proudly presented to</p>' +
                        '<h2 class="text-5xl font-bold text-blue-600 my-8">' + userName + '</h2>' +
                        '<p class="text-lg text-gray-600">for successfully completing the course</p>' +
                        '<h3 class="text-3xl font-semibold text-gray-800 mt-4">' + courseName + '</h3>' +
                        '<p class="text-md text-gray-500 mt-12">Issued on: ' + completionDate + '</p>' +
                        '<p class="text-2xl font-bold text-gray-700 mt-10">SkillHub NG</p>' +
                    '</div>' +
                    '<button onclick="window.print()" ' +
                            'class="no-print mt-12 w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 text-lg font-semibold">' +
                        'Print or Save as PDF' +
                    '</button>' +
                '</div>' +
            '</body>' +
            '</html>';

        const newWindow = window.open('', '_blank');
        newWindow.document.write(certificateHTML);
        newWindow.document.close();
    });
    // --- END OF Certificate Logic ---


    const totalSteps = data.steps.length;
    if (totalSteps === 0) return; // No steps, nothing to set up

    let currentProgress = data.enrollment.progress; // Comes from backend
    let completedSteps = Math.floor((currentProgress / 100) * totalSteps);

    function updateUI() {
        // Calculate progress percentage
        const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
        globalProgressBar.style.width = progressPercentage + '%';
        
        completeButtons.forEach((button, index) => {
            const stepElement = button.closest('.bg-white');
            if (index < completedSteps) {
                button.textContent = 'Completed!';
                button.disabled = true;
                stepElement.classList.add('step-completed');
                stepElement.classList.remove('border-gray-300', 'border-blue-500');
                stepElement.classList.add('border-green-500');
            } else if (index === completedSteps) { // This is the next active step
                button.disabled = true; // <-- STILL DISABLED (until video ends)
                button.classList.remove('bg-gray-400');
                button.classList.add('bg-green-500'); // <-- Green to show it's active
                button.textContent = 'Watch Video to Enable';
                stepElement.classList.remove('border-gray-300');
                stepElement.classList.add('border-blue-500');
            } else { // Future steps
                button.disabled = true;
                button.classList.add('bg-gray-400', 'cursor-not-allowed');
                stepElement.classList.add('border-gray-300');
            }
        });

        // **This is the logic you asked for:**
        // Show certificate *only if* progress is 80% or more
        if (progressPercentage >= 80) {
            certificate.classList.remove('hidden');
            certDate.textContent = new Date().toLocaleDateString();
        } else {
            certificate.classList.add('hidden');
        }
    }

    completeButtons.forEach(button => {
        button.addEventListener('click', async function () {
            if (this.disabled) return;

            completedSteps++;
            const newProgress = Math.round((completedSteps / totalSteps) * 100);
            
            // --- Send progress update to backend ---
            const token = localStorage.getItem('token');
            const urlParams = new URLSearchParams(window.location.search);
            const courseId = urlParams.get('id');

            try {
                await fetch(API_BASE_URL + '/api/course/' + courseId + '/progress', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ progress: newProgress })
                });
                // Update UI after successful backend update
                updateUI();
            } catch (error) {
                 console.error("Failed to update progress:", error);
                 completedSteps--; // Revert if backend call fails
            }
        });
    });

    // Initial UI setup
    updateUI();
}

